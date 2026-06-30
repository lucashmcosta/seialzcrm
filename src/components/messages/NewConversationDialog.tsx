import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EndpointSelector } from './EndpointSelector';
import { useOrgWhatsAppEndpoints } from '@/hooks/useOrgWhatsAppEndpoints';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar } from '@/components/base/avatar/avatar';
import { SpinnerGap, MagnifyingGlass, Phone, ChatCircle } from '@phosphor-icons/react';

interface Contact {
  id: string;
  full_name: string | null;
  phone: string;
}

// Helper function to validate if a name has real alphanumeric content
const getDisplayName = (contact: Contact): string => {
  const name = contact.full_name?.trim();
  if (!name) return contact.phone;
  
  // Remove non-alphanumeric characters (emojis, zero-width joiners, special chars)
  // Keeps letters, numbers, and spaces from any language
  const cleanName = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (cleanName.length === 0) return contact.phone;
  
  return name;
};

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectContact: (contactId: string, threadId: string, endpointId: string | null) => void | Promise<void>;
  /** Restringe os endpoints elegíveis por `purpose`. Quando definido, o
   *  EndpointSelector é ocultado e o endpoint é escolhido automaticamente
   *  dentro do subconjunto. Usado em /inbox para forçar Atendimento. */
  forcePurposes?: Array<'customer_service' | 'other' | 'commercial' | 'vendor_personal'>;
  /** Título customizado (default: "Nova Conversa"). */
  title?: string;
  /** Marcador jsonb gravado em message_threads.last_routing_decision quando
   *  uma thread NOVA é criada. Não é aplicado em thread já existente. */
  routingDecision?: Record<string, unknown>;
}

export function NewConversationDialog({
  open,
  onOpenChange,
  onSelectContact,
  forcePurposes,
  title,
  routingDecision,
}: NewConversationDialogProps) {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const [search, setSearch] = useState('');
  const [selecting, setSelecting] = useState<string | null>(null);
  const { endpoints, officialNumbers, loading: endpointsLoading } =
    useOrgWhatsAppEndpoints(organization?.id);

  /**
   * Endpoint preferido para criar/abrir conversa a partir do botão
   * "Nova Conversa". Regra genérica por tenant:
   * - se existir endpoint cujo external_address NÃO consta em
   *   `organization_integrations.config_values.whatsapp_number` (set
   *   `officialNumbers`), considera-o "novo/transicional" e usa o mais
   *   recente. Esse é o caminho usado quando a org está migrando de
   *   número (ex.: Central Trabalhista 7027 → 7067).
   * - senão, usa o endpoint mais recente disponível (oficial).
   * - se a org não tem endpoints carregados, retorna null e o insert
   *   cai no fallback legado (sem primary_endpoint_id).
   */
  const orderedEndpoints = useMemo(() => {
    if (!endpoints.length) return null;
    const pool = forcePurposes && forcePurposes.length > 0
      ? endpoints.filter((ep) => ep.purpose && (forcePurposes as string[]).includes(ep.purpose))
      : endpoints;
    if (!pool.length) return [];
    const endpointRank = (ep: typeof endpoints[number]) => {
      const digits = ep.external_address.replace(/\D/g, '');
      const isBrazil = digits.startsWith('55');
      const isMeta = ep.provider === 'meta_cloud_api';
      if (isMeta && isBrazil) return 0;
      if (isBrazil) return 1;
      if (isMeta) return 2;
      return 3;
    };
    return [...pool].sort((a, b) => {
      const byRank = endpointRank(a) - endpointRank(b);
      if (byRank !== 0) return byRank;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [endpoints, forcePurposes]);

  const preferredEndpointId = useMemo<string | null>(() => {
    if (!orderedEndpoints?.length) return null;
    const sorted = orderedEndpoints;
    const transitional = sorted.filter((ep) => {
      const digits = ep.external_address.replace(/\D/g, '');
      return digits && !officialNumbers.has(digits);
    });
    return (transitional[0] ?? sorted[0]).id;
  }, [orderedEndpoints, officialNumbers]);

  const noEndpointForPurpose = !endpointsLoading && !!forcePurposes && (orderedEndpoints?.length ?? 0) === 0;

  // Endpoint efetivamente usado para abrir/criar a thread. Inicia no
  // preferido (heurística) e pode ser sobrescrito pelo usuário via
  // EndpointSelector quando a org tem 2+ endpoints ativos.
  const [selectedEndpointId, setSelectedEndpointId] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedEndpointId((current) => current ?? preferredEndpointId);
    } else {
      setSelectedEndpointId(null);
      setSearch('');
    }
  }, [open, preferredEndpointId]);

  const { data: contacts, isLoading } = useQuery({
    queryKey: ['contacts-with-phone', organization?.id, search],
    queryFn: async () => {
      if (!organization?.id) return [];

      let query = supabase
        .from('contacts')
        .select('id, full_name, phone')
        .eq('organization_id', organization.id)
        .not('phone', 'is', null)
        .is('deleted_at', null)
        .order('full_name')
        .limit(50);

      if (search.trim()) {
        query = query.or(`full_name.ilike.%${search}%,phone.ilike.%${search}%`);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as Contact[];
    },
    enabled: open && !!organization?.id,
  });

  const handleSelect = async (contact: Contact) => {
    if (!organization?.id || selecting) return;

    setSelecting(contact.id);
    try {
      // "Nova Conversa" sempre abre/cria thread no endpoint preferido
      // da org (transicional > oficial). Filtrar por primary_endpoint_id
      // garante que threads antigas em outros endpoints não sejam
      // reaproveitadas — elas continuam visíveis na lista separadamente.
      let existingQuery = supabase
        .from('message_threads')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('contact_id', contact.id)
        .eq('channel', 'whatsapp')
        .in('status', ['open', 'awaiting_client', 'in_progress'])
        .order('updated_at', { ascending: false })
        .limit(1);

      const effectiveEndpointId = selectedEndpointId ?? preferredEndpointId;

      if (effectiveEndpointId) {
        existingQuery = existingQuery.eq('primary_endpoint_id', effectiveEndpointId);
      }

      const { data: existingThread } = await existingQuery.maybeSingle();

      if (existingThread) {
        await Promise.resolve(onSelectContact(contact.id, existingThread.id, effectiveEndpointId));
        onOpenChange(false);
        return;
      }

      // Create new thread anchored to the chosen endpoint (when known).
      const insertPayload: Record<string, unknown> = {
        organization_id: organization.id,
        contact_id: contact.id,
        channel: 'whatsapp',
      };
      if (effectiveEndpointId) {
        insertPayload.primary_endpoint_id = effectiveEndpointId;
      }
      if (routingDecision) {
        insertPayload.last_routing_decision = routingDecision;
      }

      const { data: newThread, error } = await supabase
        .from('message_threads')
        .insert(insertPayload as any)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!newThread?.id) throw new Error('Thread was not created');

      await Promise.resolve(onSelectContact(contact.id, newThread.id, effectiveEndpointId));
      onOpenChange(false);
    } catch (error) {
      console.error('Error selecting contact:', error);
    } finally {
      setSelecting(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ChatCircle className="w-5 h-5" />
            {title ?? (locale === 'pt-BR' ? 'Nova Conversa' : 'New Conversation')}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Search input */}
          <div className="relative">
            <MagnifyingGlass className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={locale === 'pt-BR' ? 'Buscar contato...' : 'Search contact...'}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
              autoFocus
            />
          </div>

          {/* Endpoint selector — escondido quando forcePurposes está definido */}
          {!forcePurposes && (
            <EndpointSelector
              endpoints={orderedEndpoints ?? endpoints}
              value={selectedEndpointId}
              onChange={setSelectedEndpointId}
              disabled={selecting !== null || endpointsLoading}
              locale={locale as 'pt-BR' | 'en-US'}
            />
          )}

          {noEndpointForPurpose && (
            <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
              {locale === 'pt-BR'
                ? 'Nenhum número de Atendimento configurado para esta organização.'
                : 'No service number configured for this organization.'}
            </div>
          )}





          {/* Contact list */}
          <ScrollArea className="h-[300px]">
            {isLoading ? (
              <div className="flex items-center justify-center py-8">
                <SpinnerGap className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : contacts?.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <Phone className="w-8 h-8 mb-2 opacity-50" />
                <p className="text-sm">
                  {search
                    ? locale === 'pt-BR'
                      ? 'Nenhum contato encontrado'
                      : 'No contacts found'
                    : locale === 'pt-BR'
                    ? 'Nenhum contato com telefone'
                    : 'No contacts with phone'}
                </p>
              </div>
            ) : (
              <div className="space-y-1">
                {contacts?.map((contact) => {
                  const displayName = getDisplayName(contact);
                  const showPhoneAsSecondary = displayName !== contact.phone;
                  
                  return (
                    <button
                      key={contact.id}
                      onClick={() => handleSelect(contact)}
                      disabled={selecting !== null || endpointsLoading || noEndpointForPurpose}
                      className="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-accent transition-colors text-left disabled:opacity-50"
                    >
                      <Avatar fallbackText={displayName} size="md" />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{displayName}</p>
                        {showPhoneAsSecondary && (
                          <p className="text-xs text-muted-foreground truncate">{contact.phone}</p>
                        )}
                      </div>
                      {selecting === contact.id && (
                        <SpinnerGap className="w-4 h-4 animate-spin text-muted-foreground" />
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
}
