-- Store local das conversas/mensagens da caixa Social (IG Direct + Messenger).
-- Motivo: o endpoint conversations?platform=instagram da Meta é ~8s (latência da Meta
-- + rate limits). A doc recomenda receber por webhook e servir do próprio banco.
-- A thread é identificada pelo CLIENTE (participant_id), pois é a chave comum entre o
-- backfill (from.id) e o webhook (sender/recipient). Escrito só por service_role.

create table if not exists public.social_conversations (
  organization_id uuid not null,
  platform text not null check (platform in ('instagram','messenger')),
  participant_id text not null,
  conversation_id text,                 -- id da conversa na Graph (p/ backfill de mensagens)
  name text,
  username text,
  avatar_url text,
  profile_link text,
  last_message text,
  updated_time timestamptz,
  refreshed_at timestamptz not null default now(),
  primary key (organization_id, platform, participant_id)
);
create index if not exists idx_social_conv_org_time
  on public.social_conversations (organization_id, updated_time desc);

create table if not exists public.social_messages (
  organization_id uuid not null,
  message_id text not null,
  platform text not null check (platform in ('instagram','messenger')),
  participant_id text not null,         -- cliente dono da thread
  from_page boolean not null default false,
  from_name text,
  body text,
  attachments jsonb not null default '[]'::jsonb,
  created_time timestamptz,
  primary key (organization_id, message_id)
);
create index if not exists idx_social_msg_thread
  on public.social_messages (organization_id, platform, participant_id, created_time);

alter table public.social_conversations enable row level security;
alter table public.social_messages enable row level security;
-- Sem policies: acesso só via service_role (que ignora RLS). O edge function faz a
-- verificação de membership por conta própria.
