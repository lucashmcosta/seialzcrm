import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Phone, Trash, PencilSimple, FloppyDisk, SpinnerGap, X } from '@phosphor-icons/react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { EndpointInboundSettings } from './EndpointInboundSettings';

interface Props {
  organizationId: string;
  organizationIntegrationId: string;
  officialNumber?: string | null;
  integrationFallback: any;
}

const normalizeDigits = (s?: string | null) => (s || '').replace(/\D/g, '');

export function AdditionalEndpointsSection({
  organizationId,
  organizationIntegrationId,
  officialNumber,
  integrationFallback,
}: Props) {
  const queryClient = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const { data: endpoints, isLoading } = useQuery({
    queryKey: ['additional-endpoints', organizationIntegrationId, organizationId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('communication_endpoints')
        .select('id, external_address, display_name, is_active, status, sender_sid, created_at')
        .eq('organization_id', organizationId)
        .eq('channel', 'whatsapp')
        .eq('organization_integration_id', organizationIntegrationId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data as any[]) || [];
    },
    enabled: !!organizationId && !!organizationIntegrationId,
  });

  const officialDigits = normalizeDigits(officialNumber);
  const additional = (endpoints || []).filter(
    (ep) => normalizeDigits(ep.external_address) !== officialDigits,
  );

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ['additional-endpoints', organizationIntegrationId, organizationId] });

  const handleSaveName = async (id: string) => {
    setSavingId(id);
    try {
      const { error } = await supabase
        .from('communication_endpoints')
        .update({ display_name: editName.trim() || null })
        .eq('id', id);
      if (error) throw error;
      toast.success('Apelido atualizado');
      setEditingId(null);
      invalidate();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    } finally {
      setSavingId(null);
    }
  };

  const handleToggleActive = async (id: string, current: boolean) => {
    const action = current ? 'desativar' : 'ativar';
    if (!confirm(`Deseja ${action} este número?`)) return;
    try {
      const { error } = await supabase
        .from('communication_endpoints')
        .update({ is_active: !current })
        .eq('id', id);
      if (error) throw error;
      toast.success(current ? 'Número desativado' : 'Número ativado');
      invalidate();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  const handleRemove = async (id: string, label: string) => {
    if (!confirm(`Remover o número ${label}? Esta ação não pode ser desfeita.`)) return;
    try {
      const { error } = await supabase.from('communication_endpoints').delete().eq('id', id);
      if (error) throw error;
      toast.success('Número removido');
      invalidate();
    } catch (err: any) {
      toast.error('Erro: ' + err.message);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-4">
        <SpinnerGap className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (additional.length === 0) return null;

  return (
    <div className="border-t pt-4 space-y-3">
      <Label className="text-sm font-semibold">Números adicionais</Label>
      <Accordion type="multiple" className="space-y-2">
        {additional.map((ep) => {
          const formatted = formatPhoneDisplay(ep.external_address) || ep.external_address;
          const isEditing = editingId === ep.id;
          return (
            <AccordionItem key={ep.id} value={ep.id} className="border rounded-md px-3">
              <AccordionTrigger className="hover:no-underline py-3">
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <Phone className="h-4 w-4 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium truncate">{formatted}</span>
                  {ep.display_name && (
                    <span className="text-xs text-muted-foreground truncate">— {ep.display_name}</span>
                  )}
                  <Badge
                    variant={ep.is_active ? (ep.status === 'ONLINE' ? 'success' : 'secondary') : 'outline'}
                    className="text-[10px] ml-auto mr-2"
                  >
                    {ep.is_active ? (ep.status || 'ATIVO') : 'INATIVO'}
                  </Badge>
                </div>
              </AccordionTrigger>
              <AccordionContent className="space-y-3 pb-4">
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <Label className="text-muted-foreground text-[11px]">Sender SID</Label>
                    <p className="font-mono">
                      {ep.sender_sid ? `…${ep.sender_sid.slice(-8)}` : '—'}
                    </p>
                  </div>
                  <div>
                    <Label className="text-muted-foreground text-[11px]">Cadastrado em</Label>
                    <p>{format(new Date(ep.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR })}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-xs">Apelido</Label>
                  {isEditing ? (
                    <div className="flex gap-2">
                      <Input
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        placeholder="Ex.: Atendimento SP"
                        className="h-8"
                      />
                      <Button
                        size="sm"
                        onClick={() => handleSaveName(ep.id)}
                        disabled={savingId === ep.id}
                      >
                        {savingId === ep.id ? (
                          <SpinnerGap className="h-3 w-3 animate-spin" />
                        ) : (
                          <FloppyDisk className="h-3 w-3" />
                        )}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingId(null)}>
                        <X className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="text-sm">{ep.display_name || <em className="text-muted-foreground">sem apelido</em>}</span>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(ep.id);
                          setEditName(ep.display_name || '');
                        }}
                      >
                        <PencilSimple className="h-3 w-3 mr-1" />
                        Editar
                      </Button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t pt-3">
                  <div className="flex items-center gap-2">
                    <Switch
                      checked={ep.is_active}
                      onCheckedChange={() => handleToggleActive(ep.id, ep.is_active)}
                    />
                    <Label className="text-xs">{ep.is_active ? 'Ativo' : 'Inativo'}</Label>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-destructive hover:text-destructive"
                    onClick={() => handleRemove(ep.id, formatted)}
                  >
                    <Trash className="h-3 w-3 mr-1" />
                    Remover
                  </Button>
                </div>

                <EndpointInboundSettings
                  endpointId={ep.id}
                  integrationFallback={integrationFallback}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
