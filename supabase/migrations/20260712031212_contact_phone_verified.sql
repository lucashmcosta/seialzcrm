-- Captura de "telefone verificado" no nível do contato e sinalização no formulário.
-- Origem: Meta Lead Ads envia o metadado `phone_number_verified=true` quando o
-- formulário exige verificação de telefone (leads "verificados" = alta qualidade).
-- Idempotente.

-- Contato: flag + quando foi verificado
alter table public.contacts
  add column if not exists phone_verified boolean not null default false,
  add column if not exists phone_verified_at timestamptz;

comment on column public.contacts.phone_verified is
  'Telefone confirmado pelo lead na origem (ex.: Meta Lead Ads phone_number_verified=true). Sinal de qualidade.';

-- Índice parcial p/ filtrar/priorizar leads verificados por org
create index if not exists idx_contacts_org_phone_verified
  on public.contacts (organization_id)
  where phone_verified;

-- Formulário: sinaliza que ele verifica telefone (detectado a partir dos leads),
-- para a UI de mapeamento avisar "este formulário verifica telefone".
alter table public.lead_forms
  add column if not exists has_phone_verification boolean not null default false;

comment on column public.lead_forms.has_phone_verification is
  'Formulário exige verificação de telefone (envia phone_number_verified). Detectado a partir dos leads recebidos.';
