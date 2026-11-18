// Edição rápida do contato dentro da Ficha lateral do Comercial.
// Salva campo a campo ao sair do campo (blur/Enter), com as MESMAS regras da tela
// de edição (src/lib/contactRules.ts + contactUpdate.ts). Telefone é só leitura:
// a conversa está ligada a ele; trocar por aqui poderia desligar o histórico.
import { useEffect, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { canonicalContactName, digits, formatCpf, type OperatingCountryCode } from '@/lib/regional';
import { classifyContactDbError, cpfInputError } from '@/lib/contactRules';
import { findEmailDuplicates } from '@/lib/contactUpdate';
import { useRegistryLookup } from '@/hooks/useRegistryLookup';
import { OwnerSelector } from '@/components/common/OwnerSelector';
import { OwnerSelectorReadOnly } from './OpportunitySection';
import { useOrgUserFilterOptions } from '@/hooks/useOrgUserFilterOptions';
import { ContactOwnerCascadeDialog } from '@/components/contacts/ContactOwnerCascadeDialog';
import { CheckCircle, SpinnerGap, Warning } from '@phosphor-icons/react';

type ContactRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  cpf: string | null;
  phone: string | null;
  owner_user_id: string | null;
};

type FieldKey = 'full_name' | 'first_name' | 'last_name' | 'email' | 'cpf';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactQuickEdit({
  contactId,
  canEdit,
  onSaved,
  onEditFull,
  children,
}: {
  contactId: string;
  canEdit: boolean;
  onSaved?: () => void;
  onEditFull?: () => void;
  /** Campos extras (ex.: personalizados) exibidos junto dos dados do contato. */
  children?: ReactNode;
}) {
  useUiLocale();
  const { organization, userProfile } = useOrganization();
  const qc = useQueryClient();
  const queryKey = ['ficha-contact', contactId];
  const country = (organization?.operating_country_code || 'BR') as OperatingCountryCode;
  const isBrazil = country === 'BR';
  const splitName = country === 'US';

  const { lookup } = useRegistryLookup();
  // Situação da verificação do CPF (a mesma que o cadastro completo grava).
  const identityKey = ['ficha-contact-identity', contactId];
  const identity = useQuery({
    queryKey: identityKey,
    enabled: !!contactId && isBrazil,
    queryFn: async () => {
      const { data } = await supabase.from('contact_identity_profiles')
        .select('cpf_verification_status').eq('contact_id', contactId).maybeSingle();
      return (data?.cpf_verification_status as string | undefined) ?? null;
    },
  });
  const [cpfChecking, setCpfChecking] = useState(false);
  const orgUsers = useOrgUserFilterOptions(organization?.id);
  // Troca do responsável do contato: abre a confirmação (conversa e oportunidades podem ir junto).
  const [pendingOwner, setPendingOwner] = useState<string | null | undefined>(undefined);

  const contact = useQuery({
    queryKey,
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, cpf, phone, owner_user_id')
        .eq('id', contactId)
        .maybeSingle();
      if (error) throw error;
      return data as ContactRow | null;
    },
  });

  const [draft, setDraft] = useState<Record<FieldKey, string>>({ full_name: '', first_name: '', last_name: '', email: '', cpf: '' });
  const [saving, setSaving] = useState<FieldKey | null>(null);

  useEffect(() => {
    const c = contact.data;
    if (!c) return;
    setDraft({
      full_name: c.full_name || '',
      first_name: c.first_name || '',
      last_name: c.last_name || '',
      email: c.email || '',
      cpf: c.cpf ? formatCpf(c.cpf) : '',
    });
  }, [contact.data]);

  const revert = (key: FieldKey) => {
    const c = contact.data;
    if (!c) return;
    const original = key === 'cpf' ? (c.cpf ? formatCpf(c.cpf) : '') : (c[key] || '');
    setDraft((d) => ({ ...d, [key]: original }));
  };

  const persist = async (key: FieldKey, patch: Record<string, unknown>): Promise<boolean> => {
    if (!organization || !userProfile) return false;
    setSaving(key);
    const { error } = await supabase
      .from('contacts')
      .update({ ...patch, updated_by: userProfile.id })
      .eq('id', contactId);
    setSaving(null);
    if (error) {
      const c = classifyContactDbError(error);
      if (c.kind === 'duplicate_cpf') {
        toast.error(uiText('Este CPF já pertence a outro contato.'), {
          action: { label: uiText('Abrir cadastro'), onClick: () => window.open(`/contacts/${c.contactId}`, '_blank') },
        });
      } else if (c.kind === 'duplicate_email') {
        toast.error(uiText('Já existe um contato com este e-mail nesta organização'));
      } else {
        toast.error((c.kind === 'other' && c.message) || uiText('Não foi possível salvar o contato.'));
      }
      revert(key);
      return false;
    }
    toast.success(uiText('Contato atualizado'));
    await qc.invalidateQueries({ queryKey });
    onSaved?.();
    return true;
  };

  // Mesma consulta do cadastro completo (cpf-brasil e, se preciso, SERPRO): confirma o CPF,
  // grava a verificação no contato e preenche o nome como na tela de edição.
  const verifyCpf = async (cpf: string) => {
    if (!isBrazil || !cpf) return;
    setCpfChecking(true);
    try {
      const result = await lookup<{ full_name?: string }>('cpf', cpf, { contactId });
      const name = result.data?.full_name?.trim();
      const current = contact.data;
      if (name && current && name !== (current.full_name || '')) {
        const n = canonicalContactName(country, { fullName: name, firstName: '', lastName: '' });
        await supabase.from('contacts').update({ full_name: n.fullName, first_name: n.firstName, last_name: n.lastName, updated_by: userProfile?.id })
          .eq('id', contactId);
        await qc.invalidateQueries({ queryKey });
        onSaved?.();
      }
      toast.success(result.provider === 'serpro'
        ? uiText('CPF confirmado na Receita Federal (SERPRO) e dados preenchidos.')
        : uiText('CPF verificado e dados cadastrais preenchidos.'));
    } catch (error: unknown) {
      const code = error instanceof Error ? error.message : 'registry_lookup_failed';
      const needDate = Boolean((error as { payload?: { fallback_available?: boolean } }).payload?.fallback_available);
      if (needDate) {
        toast.warning(uiText('Para confirmar este CPF, informe a data de nascimento no cadastro completo.'), {
          ...(onEditFull ? { action: { label: uiText('Abrir cadastro completo'), onClick: onEditFull } } : {}),
        });
      } else if (code.includes('invalid_cpf')) {
        toast.error(uiText('CPF inválido. Confira os dígitos informados.'));
      } else if (code.includes('not_found')) {
        toast.warning(uiText('CPF não encontrado. O contato fica salvo como não verificado.'));
      } else {
        toast.error(uiText('Não foi possível verificar agora. O contato fica salvo como não verificado.'));
      }
    } finally {
      setCpfChecking(false);
      await qc.invalidateQueries({ queryKey: identityKey });
    }
  };

  const commit = async (key: FieldKey) => {
    const c = contact.data;
    if (!c || !canEdit || !organization) return;
    const value = draft[key].trim();

    if (key === 'full_name' || key === 'first_name' || key === 'last_name') {
      if (value === (c[key] || '')) return;
      const name = canonicalContactName(country, {
        fullName: key === 'full_name' ? value : c.full_name || '',
        firstName: key === 'first_name' ? value : c.first_name || '',
        lastName: key === 'last_name' ? value : c.last_name || '',
      });
      if (!name.fullName) {
        toast.error(uiText('Informe o nome do contato.'));
        revert(key);
        return;
      }
      await persist(key, { full_name: name.fullName, first_name: name.firstName, last_name: name.lastName });
      return;
    }

    if (key === 'email') {
      if (value === (c.email || '')) return;
      if (value && !EMAIL_RE.test(value)) {
        toast.error(uiText('E-mail inválido.'));
        revert(key);
        return;
      }
      if (value) {
        const dups = await findEmailDuplicates(organization, value, contactId);
        if (dups.length > 0) {
          if (organization.duplicate_enforce_block) {
            toast.error(uiText('Já existe um contato com este e-mail nesta organização'));
            revert(key);
            return;
          }
          // Mesma regra da tela de edição: avisa e só grava se o usuário confirmar.
          toast.warning(uiText('Já existe um contato com este e-mail nesta organização'), {
            action: { label: uiText('Salvar mesmo assim'), onClick: () => { void persist('email', { email: value }); } },
            onDismiss: () => revert('email'),
            onAutoClose: () => revert('email'),
          });
          return;
        }
      }
      await persist(key, { email: value || null });
      return;
    }

    if (key === 'cpf') {
      const newDigits = value ? digits(value) : '';
      if (newDigits === (c.cpf || '')) return;
      const err = cpfInputError(value);
      if (err) {
        toast.error(uiText(err));
        revert(key);
        return;
      }
      // A verificação cadastral é reiniciada no banco (trg_contacts_reset_cpf_verification);
      // em seguida consulta de novo, como no cadastro completo.
      const ok = await persist(key, { cpf: newDigits || null });
      if (ok && newDigits) await verifyCpf(newDigits);
      else if (ok) await qc.invalidateQueries({ queryKey: identityKey });
    }
  };

  if (contact.isLoading) {
    return <p className="text-xs text-muted-foreground">{uiText('Carregando...')}</p>;
  }
  if (!contact.data) {
    return <p className="text-xs text-muted-foreground">{uiText('Contato não encontrado.')}</p>;
  }

  const cpfStatusIcon = () => {
    if (!isBrazil || !draft.cpf) return null;
    if (cpfChecking) return <SpinnerGap className="h-4 w-4 animate-spin text-muted-foreground" aria-label={uiText('Verificando CPF')} />;
    if (identity.data === 'verified') return <CheckCircle className="h-4 w-4 text-emerald-600" weight="fill" aria-label={uiText('CPF verificado')} />;
    if (identity.data) return (
      <button type="button" title={uiText('CPF não verificado. Clique para consultar de novo.')} aria-label={uiText('Consultar CPF de novo')}
        onClick={() => { const d = digits(draft.cpf); if (d.length === 11) void verifyCpf(d); }}>
        <Warning className="h-4 w-4 text-amber-500" weight="fill" />
      </button>
    );
    return null;
  };

  const field = (key: FieldKey, label: string, extra?: { placeholder?: string; inputMode?: 'email' | 'numeric' }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`ficha-${key}`} className="text-xs text-muted-foreground">{label}</Label>
      <div className="relative">
      <Input
        id={`ficha-${key}`}
        value={draft[key]}
        disabled={!canEdit || saving === key}
        placeholder={extra?.placeholder}
        inputMode={extra?.inputMode}
        onChange={(e) => {
          const v = key === 'cpf' ? formatCpf(digits(e.target.value).slice(0, 11)) : e.target.value;
          setDraft((d) => ({ ...d, [key]: v }));
        }}
        onBlur={() => { void commit(key); }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') { revert(key); (e.target as HTMLInputElement).blur(); }
        }}
        className={key === 'cpf' ? 'pr-9' : undefined}
      />
      {key === 'cpf' && <span className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center">{cpfStatusIcon()}</span>}
      </div>
    </div>
  );

  return (
    <section className="space-y-3">
      <h3 data-ficha-title className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{uiText('Contato')}</h3>
      {splitName ? (
        <>
          {field('first_name', uiText('Nome'))}
          {field('last_name', uiText('Sobrenome'))}
        </>
      ) : (
        field('full_name', uiText('Nome'))
      )}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{uiText('Telefone')}</Label>
        <p className="text-sm font-mono">{contact.data.phone || '—'}</p>
      </div>
      {field('email', 'E-mail', { placeholder: 'nome@exemplo.com', inputMode: 'email' })}
      {isBrazil && field('cpf', 'CPF', { placeholder: '000.000.000-00', inputMode: 'numeric' })}
      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground">{uiText('Responsável')}</Label>
        {canEdit ? (
          <OwnerSelector
            size="sm"
            value={contact.data.owner_user_id ?? null}
            onChange={(userId) => { if (userId !== (contact.data?.owner_user_id ?? null)) setPendingOwner(userId); }}
            placeholder={uiText('Sem responsável')}
          />
        ) : (
          <OwnerSelectorReadOnly value={contact.data.owner_user_id ?? null} />
        )}
      </div>
      {pendingOwner !== undefined && (
        <ContactOwnerCascadeDialog
          open
          contactId={contactId}
          newOwnerId={pendingOwner}
          newOwnerName={orgUsers.find((u) => u.id === pendingOwner)?.fullName ?? uiText('Sem responsável')}
          onCancel={() => setPendingOwner(undefined)}
          onDone={async () => {
            setPendingOwner(undefined);
            await qc.invalidateQueries({ queryKey });
            onSaved?.();
          }}
        />
      )}
      {children}
      {!canEdit && (
        <p className="text-xs text-muted-foreground">{uiText('Você não tem permissão para editar contatos.')}</p>
      )}
      {canEdit && onEditFull && (
        <button type="button" onClick={onEditFull} className="inline-block text-xs text-primary hover:underline">
          {uiText('Editar cadastro completo')}
        </button>
      )}
    </section>
  );
}
