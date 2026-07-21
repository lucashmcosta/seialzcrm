import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, User, ArrowSquareOut, Plus, Eye, SpinnerGap } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { useToast } from '@/hooks/use-toast';
import { normalizePhoneBR } from '@/lib/normalizePhoneBR';

type MetaRaw = {
  type?: string;
  reaction?: { emoji?: string; message_id?: string };
  location?: { name?: string; address?: string; latitude?: number; longitude?: number };
  contacts?: Array<{
    name?: { formatted_name?: string; first_name?: string; last_name?: string };
    phones?: Array<{ phone?: string; wa_id?: string; type?: string }>;
    emails?: Array<{ email?: string; type?: string }>;
  }>;
  interactive?: { nfm_reply?: { name?: string; response_json?: string } };
} | null | undefined;

interface Props {
  metadata: unknown;
  content: string;
  isOutbound: boolean;
  className?: string;
  /** Fallback renderer for regular text (WhatsAppFormattedText or <p>). */
  fallback: (content: string) => JSX.Element;
}

function readRaw(metadata: unknown): MetaRaw {
  if (!metadata || typeof metadata !== 'object') return null;
  const meta = metadata as Record<string, unknown>;

  // Provider-neutral shape (used by Evolution API and any future provider).
  const rich = meta.rich_message as Record<string, unknown> | undefined;
  if (rich && typeof rich === 'object' && typeof rich.type === 'string') {
    const r = rich as Record<string, unknown>;
    return {
      type: r.type as string,
      reaction: r.reaction as MetaRaw extends null ? never : NonNullable<MetaRaw>['reaction'],
      location: r.location as NonNullable<MetaRaw>['location'],
      contacts: r.contacts as NonNullable<MetaRaw>['contacts'],
      interactive: r.interactive as NonNullable<MetaRaw>['interactive'],
    } as MetaRaw;
  }

  // Meta Cloud native shape.
  const mc = meta.meta_cloud as Record<string, unknown> | undefined;
  if (!mc || typeof mc !== 'object') return null;
  const raw = mc.raw;
  if (!raw || typeof raw !== 'object') return null;
  return raw as MetaRaw;
}

/**
 * Detects Meta special payload types (reaction/location/contacts/sticker/flow)
 * and renders rich UI. Falls back to caller-provided renderer for text.
 */
export function MetaRichMessageContent({
  metadata,
  content,
  isOutbound,
  className,
  fallback,
}: Props) {
  const raw = readRaw(metadata);
  const type = raw?.type;

  if (type === 'reaction' && raw?.reaction?.emoji) {
    return <ReactionContent emoji={raw.reaction.emoji} isOutbound={isOutbound} />;
  }
  if ((type === 'location' || type === 'live_location') && raw?.location) {
    return <LocationCard location={raw.location} isOutbound={isOutbound} live={type === 'live_location'} />;
  }
  if (type === 'contacts' && Array.isArray(raw?.contacts) && raw.contacts.length > 0) {
    return <ContactsCard contacts={raw.contacts} isOutbound={isOutbound} />;
  }
  if (type === 'sticker') {
    return (
      <div className={`text-3xl leading-none ${className ?? ''}`}>🏷️</div>
    );
  }
  if (raw?.interactive?.nfm_reply) {
    return (
      <FlowReplyCard
        name={raw.interactive.nfm_reply.name || 'WhatsApp Flow'}
        isOutbound={isOutbound}
      />
    );
  }

  return fallback(content);
}

/* -------------------------------- Reaction -------------------------------- */

function ReactionContent({ emoji, isOutbound }: { emoji: string; isOutbound: boolean }) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span className="text-3xl leading-none">{emoji}</span>
      <span
        className={`text-xs ${isOutbound ? 'text-white/70' : 'text-muted-foreground'}`}
      >
        reagiu a uma mensagem
      </span>
    </div>
  );
}

/* -------------------------------- Location -------------------------------- */

function LocationCard({
  location,
  isOutbound,
  live = false,
}: {
  location: NonNullable<NonNullable<MetaRaw>['location']>;
  isOutbound: boolean;
  live?: boolean;
}) {
  const { name, address, latitude, longitude } = location;
  const hasCoords = latitude != null && longitude != null;
  const mapsUrl = hasCoords
    ? `https://www.google.com/maps/search/?api=1&query=${latitude},${longitude}`
    : null;
  const staticMap = hasCoords
    ? `https://staticmap.openstreetmap.de/staticmap.php?center=${latitude},${longitude}&zoom=15&size=280x140&markers=${latitude},${longitude},red-pushpin`
    : null;

  const surface = isOutbound ? 'bg-white/10' : 'bg-background';
  const subText = isOutbound ? 'text-white/70' : 'text-muted-foreground';

  return (
    <div className={`rounded-md overflow-hidden ${surface} min-w-[240px] max-w-[300px]`}>
      {staticMap && (
        <a href={mapsUrl!} target="_blank" rel="noopener noreferrer" className="block">
          <img
            src={staticMap}
            alt="Localização"
            className="w-full h-[140px] object-cover"
            loading="lazy"
            onError={(e) => {
              (e.currentTarget as HTMLImageElement).style.display = 'none';
            }}
          />
        </a>
      )}
      <div className="p-2 flex items-start gap-2">
        <MapPin size={18} weight="fill" className={isOutbound ? 'text-white/80' : 'text-primary'} />
        <div className="flex-1 min-w-0">
          {name && <div className="text-sm font-medium truncate">{name}</div>}
          {address && <div className={`text-xs truncate ${subText}`}>{address}</div>}
          {hasCoords && (
            <div className={`text-[11px] ${subText}`}>
              {latitude!.toFixed(5)}, {longitude!.toFixed(5)}
            </div>
          )}
          {mapsUrl && (
            <a
              href={mapsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`mt-1 inline-flex items-center gap-1 text-xs underline ${
                isOutbound ? 'text-white' : 'text-primary'
              }`}
            >
              Abrir no Google Maps <ArrowSquareOut size={12} />
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

/* -------------------------------- Contacts -------------------------------- */

type SharedContact = NonNullable<NonNullable<MetaRaw>['contacts']>[number];

function ContactsCard({
  contacts,
  isOutbound,
}: {
  contacts: SharedContact[];
  isOutbound: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {contacts.map((c, i) => (
        <SingleSharedContactCard key={i} contact={c} isOutbound={isOutbound} />
      ))}
    </div>
  );
}

function SingleSharedContactCard({
  contact,
  isOutbound,
}: {
  contact: SharedContact;
  isOutbound: boolean;
}) {
  const name =
    contact.name?.formatted_name ||
    [contact.name?.first_name, contact.name?.last_name].filter(Boolean).join(' ') ||
    'Contato';
  const primaryPhone = contact.phones?.[0]?.wa_id || contact.phones?.[0]?.phone || null;
  const normalizedPhone = useMemo(() => normalizePhoneBR(primaryPhone), [primaryPhone]);

  const { organization } = useOrganizationContext();
  const orgId = organization?.id ?? null;

  const [existingId, setExistingId] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [addOpen, setAddOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!normalizedPhone || !orgId) {
      setChecking(false);
      return;
    }
    (async () => {
      const { data } = await supabase
        .from('contacts')
        .select('id')
        .eq('organization_id', orgId)
        .eq('phone_normalized', normalizedPhone)
        .is('deleted_at', null)
        .maybeSingle();
      if (!cancelled) {
        setExistingId((data?.id as string) ?? null);
        setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [normalizedPhone, orgId]);

  const surface = isOutbound ? 'bg-white/10' : 'bg-background';
  const subText = isOutbound ? 'text-white/70' : 'text-muted-foreground';

  return (
    <div className={`rounded-md ${surface} p-3 min-w-[240px] max-w-[300px]`}>
      <div className="flex items-center gap-2 mb-2">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center ${
            isOutbound ? 'bg-white/20' : 'bg-muted'
          }`}
        >
          <User size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium truncate">{name}</div>
          {primaryPhone && (
            <div className={`text-xs ${subText}`}>+{primaryPhone.replace(/\D/g, '')}</div>
          )}
        </div>
      </div>

      {contact.phones && contact.phones.length > 1 && (
        <div className={`text-[11px] ${subText} mb-2`}>
          +{contact.phones.length - 1} outro(s) telefone(s)
        </div>
      )}

      <div className="flex gap-1.5 flex-wrap">
        {checking ? (
          <SpinnerGap size={14} className="animate-spin" />
        ) : existingId ? (
          <>
            <Button
              asChild
              size="sm"
              variant={isOutbound ? 'secondary' : 'outline'}
              className="h-7 text-xs"
            >
              <Link to={`/contacts/${existingId}`}>
                <Eye size={12} className="mr-1" />
                Abrir contato
              </Link>
            </Button>
            <span className={`text-[11px] ${subText} self-center`}>já existe</span>
          </>
        ) : (
          <>
            <Button
              size="sm"
              variant={isOutbound ? 'secondary' : 'outline'}
              className="h-7 text-xs"
              onClick={() => setAddOpen(true)}
            >
              <Plus size={12} className="mr-1" />
              Adicionar contato
            </Button>
          </>
        )}
      </div>

      {addOpen && (
        <AddSharedContactDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          initialName={name}
          initialPhone={primaryPhone ?? ''}
          onCreated={(id) => setExistingId(id)}
        />
      )}
    </div>
  );
}

function AddSharedContactDialog({
  open,
  onOpenChange,
  initialName,
  initialPhone,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  initialName: string;
  initialPhone: string;
  onCreated: (id: string) => void;
}) {
  const { organization } = useOrganizationContext();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(initialName);
  const [phone, setPhone] = useState(initialPhone);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    if (!organization?.id) return;
    setSaving(true);
    try {
      const normalized = normalizePhoneBR(phone);
      // Re-check to avoid duplicates race
      if (normalized) {
        const { data: exists } = await supabase
          .from('contacts')
          .select('id')
          .eq('organization_id', organization.id)
          .eq('phone_normalized', normalized)
          .is('deleted_at', null)
          .maybeSingle();
        if (exists?.id) {
          toast({ title: 'Contato já existe', description: 'Abrindo o contato existente.' });
          onCreated(exists.id as string);
          onOpenChange(false);
          setSaving(false);
          return;
        }
      }
      const { data, error } = await supabase
        .from('contacts')
        .insert({
          organization_id: organization.id,
          full_name: name.trim() || 'Sem nome',
          phone: phone.trim() || null,
        })
        .select('id')
        .single();
      if (error) throw error;
      toast({ title: 'Contato adicionado' });
      onCreated(data.id as string);
      onOpenChange(false);
    } catch (e) {
      toast({
        title: 'Erro ao adicionar contato',
        description: (e as Error).message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Adicionar contato</DialogTitle>
          <DialogDescription>
            Salvar este contato compartilhado na sua base.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label htmlFor="shared-contact-name">Nome</Label>
            <Input
              id="shared-contact-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="shared-contact-phone">Telefone</Label>
            <Input
              id="shared-contact-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55 11 91234-5678"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              navigate('/contacts/new');
            }}
            disabled={saving}
          >
            Ver detalhes
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <SpinnerGap size={14} className="animate-spin mr-1" /> : null}
            Adicionar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* -------------------------------- Flow reply ------------------------------ */

function FlowReplyCard({ name, isOutbound }: { name: string; isOutbound: boolean }) {
  const surface = isOutbound ? 'bg-white/10' : 'bg-background';
  const subText = isOutbound ? 'text-white/70' : 'text-muted-foreground';
  return (
    <div className={`rounded-md ${surface} p-2 min-w-[220px] max-w-[300px]`}>
      <div className={`text-[11px] uppercase tracking-wide ${subText}`}>
        Resposta de formulário
      </div>
      <div className="text-sm font-medium">📋 {name}</div>
    </div>
  );
}
