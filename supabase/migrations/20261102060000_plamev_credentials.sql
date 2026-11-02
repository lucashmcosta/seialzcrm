-- Token da API da Plamev por organização (widget plamev_quote). Cada org cola o próprio token em
-- /settings/widgets/plamev_quote. Só a edge function plamev-quote lê/grava (service_role); o token fica
-- cifrado (AES-GCM, INTEGRATION_CREDENTIALS_KEY) e o navegador só vê os 4 últimos caracteres.
create table if not exists public.plamev_credentials (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  token_ciphertext text not null,
  token_last4 text not null,
  updated_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plamev_credentials enable row level security;
revoke all on public.plamev_credentials from public, anon, authenticated;
grant all on public.plamev_credentials to service_role;

create trigger trg_plamev_credentials_updated
before update on public.plamev_credentials
for each row execute function public.update_updated_at_column();
