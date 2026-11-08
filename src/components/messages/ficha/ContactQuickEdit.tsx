// Edição rápida do contato dentro da Ficha lateral do Comercial.
// Salva campo a campo ao sair do campo (blur/Enter), com as MESMAS regras da tela
// de edição (src/lib/contactRules.ts + contactUpdate.ts). Telefone é só leitura:
// a conversa está ligada a ele; trocar por aqui poderia desligar o histórico.
import { useEffect, useState } from 'react';
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

type ContactRow = {
  id: string;
  full_name: string | null;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  cpf: string | null;
  phone: string | null;
};

type FieldKey = 'full_name' | 'first_name' | 'last_name' | 'email' | 'cpf';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function ContactQuickEdit({
  contactId,
  canEdit,
  onSaved,
  onEditFull,
}: {
  contactId: string;
  canEdit: boolean;
  onSaved?: () => void;
  onEditFull?: () => void;
}) {
  useUiLocale();
  const { organization, userProfile } = useOrganization();
  const qc = useQueryClient();
  const queryKey = ['ficha-contact', contactId];
  const country = (organization?.operating_country_code || 'BR') as OperatingCountryCode;
  const isBrazil = country === 'BR';
  const splitName = country === 'US';

  const contact = useQuery({
    queryKey,
    enabled: !!contactId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('id, full_name, first_name, last_name, email, cpf, phone')
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

  const persist = async (key: FieldKey, patch: Record<string, unknown>) => {
    if (!organization || !userProfile) return;
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
      return;
    }
    toast.success(uiText('Contato atualizado'));
    await qc.invalidateQueries({ queryKey });
    onSaved?.();
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
      // A verificação cadastral é reiniciada no banco (trg_contacts_reset_cpf_verification).
      await persist(key, { cpf: newDigits || null });
    }
  };

  if (contact.isLoading) {
    return <p className="text-xs text-muted-foreground">{uiText('Carregando...')}</p>;
  }
  if (!contact.data) {
    return <p className="text-xs text-muted-foreground">{uiText('Contato não encontrado.')}</p>;
  }

  const field = (key: FieldKey, label: string, extra?: { placeholder?: string; inputMode?: 'email' | 'numeric' }) => (
    <div className="space-y-1.5">
      <Label htmlFor={`ficha-${key}`} className="text-xs text-muted-foreground">{label}</Label>
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
      />
    </div>
  );

  return (
    <section className="space-y-3">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{uiText('Contato')}</h3>
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
