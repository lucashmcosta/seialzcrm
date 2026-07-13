-- Linhas de mensageria + rotação de número (Fase 0).
-- Separa "número de envio" (rotacionável, por linha/tela) da identidade da
-- conversa (thread do contato). Ver docs/plans/2026-07-endpoint-lines-rotation.md.
-- Não semeia UUID de org aqui (antipadrão de drift): as linhas da org são criadas
-- por dado (execute_sql/UI), não por migration.

-- Linha: papel (Comercial/Atendimento) -> número ativo agora. 1 número ativo por
-- linha; unique garante "1 linha por tela por org" hoje (futuro: dropar p/ várias).
create table if not exists public.messaging_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  key text not null check (key in ('commercial','customer_service')),
  name text not null,
  channel text not null default 'whatsapp',
  active_endpoint_id uuid references public.communication_endpoints(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key, channel)
);

create index if not exists idx_messaging_lines_org on public.messaging_lines(organization_id);

-- Log de rotação (auditoria): de/para/quando/quem/motivo.
create table if not exists public.messaging_line_rotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  line_id uuid not null references public.messaging_lines(id) on delete cascade,
  from_endpoint_id uuid references public.communication_endpoints(id) on delete set null,
  to_endpoint_id uuid references public.communication_endpoints(id) on delete set null,
  reason text,
  rotated_by_user_id uuid references public.users(id) on delete set null,
  rotated_at timestamptz not null default now()
);

create index if not exists idx_messaging_line_rotations_line on public.messaging_line_rotations(line_id, rotated_at desc);

-- updated_at
drop trigger if exists trg_messaging_lines_updated_at on public.messaging_lines;
create trigger trg_messaging_lines_updated_at
  before update on public.messaging_lines
  for each row execute function public.update_updated_at_column();

-- RLS: membros da org leem/gerenciam; service_role total (edge functions).
alter table public.messaging_lines enable row level security;
alter table public.messaging_line_rotations enable row level security;

drop policy if exists "org members manage messaging_lines" on public.messaging_lines;
create policy "org members manage messaging_lines" on public.messaging_lines
  for all to authenticated
  using (organization_id = any(public.current_user_org_ids()))
  with check (organization_id = any(public.current_user_org_ids()));

drop policy if exists "org members read line rotations" on public.messaging_line_rotations;
create policy "org members read line rotations" on public.messaging_line_rotations
  for select to authenticated
  using (organization_id = any(public.current_user_org_ids()));

drop policy if exists "org members insert line rotations" on public.messaging_line_rotations;
create policy "org members insert line rotations" on public.messaging_line_rotations
  for insert to authenticated
  with check (organization_id = any(public.current_user_org_ids()));

grant select, insert, update, delete on public.messaging_lines to authenticated;
grant select, insert on public.messaging_line_rotations to authenticated;
grant all on public.messaging_lines to service_role;
grant all on public.messaging_line_rotations to service_role;
