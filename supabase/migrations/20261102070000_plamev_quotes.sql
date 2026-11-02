-- Cotações Plamev gravadas pelo widget plamev_quote, ligadas à oportunidade. Só a edge function plamev-quote
-- lê/grava (service_role) e ela confere, com o JWT do usuário, que ele enxerga a oportunidade (RLS de opportunities).
-- Sem dados do cliente aqui: eles ficam no contato e na Plamev. A linha do tempo recebe uma nota em activities.
create table if not exists public.plamev_quotes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  opportunity_id uuid not null references public.opportunities(id) on delete cascade,
  numero_cotacao text not null,
  plamev_cotacao_id text not null,
  link_pagamento text,
  forma_pagamento smallint not null check (forma_pagamento in (1, 2)),
  valor_mensalidade numeric(12, 2) not null,
  valor_adesao numeric(12, 2) not null,
  -- [{ nome, plano }] — nome do pet e plano escolhido, para mostrar o histórico
  pets jsonb not null default '[]'::jsonb,
  created_by_user_id uuid references public.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_plamev_quotes_opportunity on public.plamev_quotes (opportunity_id, created_at desc);

alter table public.plamev_quotes enable row level security;
revoke all on public.plamev_quotes from public, anon, authenticated;
grant all on public.plamev_quotes to service_role;
