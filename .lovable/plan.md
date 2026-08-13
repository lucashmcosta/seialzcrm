# Switch de número de resposta (Comercial) — auditoria + proposta mínima

Produção está ativa. Nada nesta etapa altera o comportamento atual: a feature nasce OFF, fail-closed, e "Automático" reproduz exatamente o fluxo de hoje.

## PARTE A — Resultado da auditoria (read-only, já executada)

```text
SWITCH_AUDIT=PASS
PERMISSION_SOURCE=ausente
PERSISTENCE_SOURCE=ausente
BACKEND_OVERRIDE_READY=NAO
SCHEMA_CHANGE_REQUIRED=SIM
FEATURE_DEFAULT=OFF
VIAGI_REGRESSION=n/a (nenhuma alteração feita ainda)
CENTRAL_REGRESSION=n/a
ATENDIMENTO_REGRESSION=n/a
META / TWILIO / EVOLUTION=n/a
BLOQUEADORES_SWITCH=1) sem fonte de permissão usuário↔endpoint; 2) sem persistência da escolha; 3) Resolver V2 sobrescreve endpoint explícito
```

### Achados objetivos

**A) Permissão usuário ↔ endpoint: NÃO existe.**
`communication_endpoints.assigned_user_id` existe como coluna mas está **NULL em 25/25 endpoints** e não é lida por nenhum código de mensageria (só telefonia usa `assigned_user_id` em outra tabela). `messaging_lines.owner_user_id` também está 100% NULL. `organization_phone_number_users` é exclusivo de **voz** (`can_receive_calls` / `can_originate_calls`), não de WhatsApp. Não há nenhuma outra relação usuário↔endpoint.

**B) Endpoint associado a usuário: não.** `purpose` aceita `vendor_personal` no código, mas os dados atuais só têm `commercial`, `customer_service`, `other`.

**C) Dispatcher aceita endpoint explícito: SIM**, sem gambiarra — `endpointId` é campo de primeira classe em `src/lib/dispatchWhatsAppSend.ts` e em `_shared/dispatch-whatsapp-send.ts`, e o composer já envia `composerEndpointId`.

**D) Resolver V2 sobrescreve endpoint explícito: SIM (confirmado no código).**
Cliente (`dispatchWhatsAppSend.ts`) — comentário e código: *"Precede QUALQUER outra resolução, inclusive endpointId explícito do caller"*; faz `payload = { ...payload, endpointId: canonical.sendEndpointId }`.
Servidor (`_shared/dispatch-whatsapp-send.ts`) — idem, `resolveProvider` chama `resolveSalesReplyRoute` antes de olhar `payload.endpointId`.
Logo, hoje um número escolhido pelo operador em org com V2 ON seria **silenciosamente trocado** pelo `active_endpoint_id` da Route.

**Persistência da escolha: não existe campo apropriado.** `message_threads` não tem nada por-usuário; reutilizar `primary_endpoint_id` ou `active_endpoint_id` é proibido pelo contrato.

**Auditoria de envio: parcialmente pronta.** `messages` já grava `endpoint_id`, `sender_user_id`, `sent_at` e tem `metadata` jsonb — isso cobre thread/usuário/endpoint/provider/timestamp. Falta apenas o marcador **automático vs manual** (cabe em `metadata`, sem schema novo).

**Feature flag: mecanismo existe** (`feature_flags` + `fn_feature_flag_enabled`), mas atenção: no resolver, `organization_ids = []` significa **GLOBAL**. Portanto a flag nova deve nascer `is_enabled = false` com `organization_ids = '{}'`.

## Conclusão da Parte A: PARO antes de migrar

Como exige schema, não implemento agora. Migração mínima proposta (2 objetos, nada destrutivo):

```sql
-- 1) Fonte de permissão usuário ↔ endpoint (Comercial)
create table public.user_reply_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint_id uuid not null references public.communication_endpoints(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, user_id, endpoint_id)
);
grant select on public.user_reply_endpoints to authenticated;
grant all on public.user_reply_endpoints to service_role;
alter table public.user_reply_endpoints enable row level security;
create policy "own rows readable" on public.user_reply_endpoints
  for select to authenticated
  using (user_id = current_user_id() and organization_id = any(current_user_org_ids()));
-- escrita: apenas admin da org (política adicional) ou service_role

-- 2) Escolha por conversa + operador ("Responder por"), limpável
create table public.thread_reply_endpoint_prefs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  thread_id uuid not null references public.message_threads(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  endpoint_id uuid not null references public.communication_endpoints(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (thread_id, user_id)
);
-- grants/RLS análogos (linha própria do usuário na própria org)

-- 3) Flag nova, DESLIGADA e sem orgs
insert into public.feature_flags (name, description, is_enabled, organization_ids)
values ('sales_manual_reply_endpoint_v1','Switch Responder por (Comercial)',false,'{}')
on conflict (name) do nothing;
```

Nenhum backfill. Tabelas vazias ⇒ com a flag OFF, comportamento idêntico ao atual.

### Implementação (somente após sua aprovação da migração)

1. `_shared/manual-reply-endpoint.ts` — validador server-side único: usuário autenticado, mesma org, permissão em `user_reply_endpoints`, endpoint da org, `channel = whatsapp`, apto ao Comercial, `is_active`, provider elegível; Evolution ⇒ sessão conectada + identidade + `owner_number_digits`; Meta/Twilio ⇒ mecanismo de integração existente. Erros: `MANUAL_REPLY_ENDPOINT_FORBIDDEN`, `_OFFLINE`, `_IDENTITY_MISMATCH`. Sem fallback.
2. Novo campo de payload `manualReplyEndpointId` (semântico, distinto de `endpointId`). Nos dois dispatchers: **se presente e flag ON**, valida e envia por ele, **antes** do Resolver V2 (V2 não sobrescreve). Se ausente ⇒ código atual roda byte-a-byte.
3. Gravação: `messages.metadata.reply_endpoint_choice = 'manual' | 'auto'` + `chosen_by_user_id`. Nada de rotação: proibido tocar `active_endpoint_id`, `messaging_line_rotations`, `primary_endpoint_id`.
4. UI (só Comercial, só com flag ON): `Responder por: [Automático ▾]` discreto no composer, opções = Comercial autorizado + endpoints do próprio usuário, com "Voltar para Automático" e os tooltips definidos. Header intocado. Atendimento intocado.
5. Testes: T1–T8 (regressão com flag OFF, incluindo teste estático de que sem `manualReplyEndpointId` o caminho é idêntico) e T9–T20 em org controlada.

## PARTE B — Auditoria de Configurações (read-only, entrega seguinte)

Depois de fechar/isolar o switch, entrego um documento de auditoria (sem tocar nada): navegação atual completa de `/settings/*`; mapa por provider (Meta, Twilio, Evolution) com onde vive cada credencial/número/webhook/template; mapa de criação de Contato, criação de Oportunidade, Round Robin, reabertura de thread/oportunidade; regra Comercial vs Atendimento (`purpose` / `business_context` / Route); duplicidades encontradas; classificação Integração / Configuração / Regra / Automação / Permissão; proposta da nova árvore (Organização, Usuários, Inbox/Canais, Automações, Integrações, IA); o que é só frontend, o que exige backend/schema, e risco de cada item. Nenhuma rota, tela ou regra é movida antes da sua aprovação.

## Decisão que preciso de você

Aprovar (ou ajustar) a migração mínima acima. Sem ela, o switch não pode existir sem heurística proibida.
