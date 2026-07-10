# Webchat v1 — canal próprio de captação (hedge de WhatsApp/Meta)

Status: **implementado no repo, não aplicado em produção** (2026-07-09, branch `feat/webchat-v1`). Motivador: desativação de contas WhatsApp pela Meta → necessidade de um funil de captação que não dependa da Meta.

Plano aprovado: `~/.claude/plans/abundant-shimmying-minsky.md`. Escopo v1: multi-tenant, roteiro determinístico (sem IA), sem OTP (telefone validado só localmente), widget embutível em LP externa, UI mínima no Seialz. Primeiros tenants: Central Trabalhista + Viagi.

## O que foi construído

| Camada | Arquivos |
|---|---|
| Migration | `supabase/migrations/20260709193840_*.sql` — `webchat_sessions`, `webchat_session_messages` (quarentena, RLS read-only pra org, nada de anon) + `promote_session_to_contact(uuid)` |
| Helpers edge | `supabase/functions/_shared/webchat.ts` (resolução widget-key, token sha256, Origin allowlist, log inbound), `_shared/webchat-flow.ts` (**motor de roteiro — a costura que a IA substitui no v2**) |
| Edge functions | `webchat-config`, `webchat-message`, `webchat-messages`, `webchat-heartbeat` (todas `verify_jwt=false` no `config.toml`) |
| Widget | `public/webchat/loader.js` (~2kb) + `public/webchat/app.html` (iframe self-contained, vanilla, zero-build) |
| UI config | `src/components/settings/WebchatSettings.tsx` + `WebchatFlowBuilder.tsx` (construtor visual) + rota em `App.tsx` + card "Webchat" no grupo Integrações & Canais |

## Validado localmente (Postgres 17 c/ schema de prod)

Testado ponta a ponta contra o schema real de produção (dump → Postgres local, sem tocar prod). O teste local **pegou 5 bugs de integração** que teriam quebrado em produção, todos corrigidos:
1. Steps de **botões** não esperavam resposta (motor de roteiro).
2. `channel='webchat'` e `provider='seialz'` **barrados por CHECK constraint** (adicionado no sync recente) → a migration agora **alarga os dois CHECK** (aditivo).
3. `media_type='text'` **barrado por CHECK** (texto = NULL) no transplante.
4. **Dedup quebrado** — telefone sem DDI (55) não batia; a promoção agora **canoniza com 55** antes de deduplicar (bate inclusive com leads do WhatsApp).
5. **Violação de thread única** (`message_threads_unique_open_per_contact_endpoint`) → a promoção **reusa a thread aberta** existente.
Motor de roteiro: 21/21 em testes unitários. Promoção + dedup + outbox + idempotência + reuso de thread: ✓.

## Recursos do widget (v1)

- **Abrir de 4 formas:** bolha flutuante · botão próprio (`data-seialz-chat` em qualquer elemento) · API JS (`SeialzWidget.open()`) · auto-abrir após N segundos.
- **Mobile:** fullscreen com teclado tipo WhatsApp (header fixo, composer acima do teclado — resize do iframe pelo loader via `visualViewport`), sem zoom no foco, safe-area.
- **Marca:** cor única recolore tudo (bolha, header, chips, mensagens, enviar); nome + foto (avatar) configuráveis; `*negrito*` e `{name}` nas falas.
- **Roteiro:** construtor visual (passos com tipo, botões, reordenar) — gera o mesmo `flow` que o motor consome; sem JSON.

## Como funciona (fluxo)

1. Operador cria widget em **Configurações → Webchat**: nome, nome/foto no chat, cor, domínios permitidos, etapa-alvo do lead, roteiro (construtor visual), e como o chat abre. Gera `external_account_id = 'wgt_...'` num `communication_endpoint` (`channel='webchat'`, `provider='seialz'`); config inteira em `inbound_settings`.
2. Cola o snippet (2 linhas) na LP → `loader.js` injeta o launcher → iframe carrega `app.html`.
3. Visitante conversa: `webchat-message` cria sessão (quarentena), avança o roteiro, grava tudo em `webchat_session_messages`. **Nada vira contact até qualificar.**
4. Ao completar com nome + telefone válido → `status='qualified'` → `promote_session_to_contact()`: dedupe de contact por telefone, cria opportunity na etapa-alvo (round-robin por trigger), cria thread `channel='webchat'`, transplanta o transcript, marca `promoted`. **CAPI Lead + outbox disparam por trigger** (não manualmente).
5. Lead aparece no inbox/pipeline como qualquer outro.

## Decisões travadas

- **CAPI não é disparado à mão** na promoção (o trigger `fn_capi_trigger_lead_on_contact` dispara no insert do contact; evita Lead duplicado).
- **Sem UUID de org hardcoded** — os 2 widgets são criados pela UI, não por migration.
- **Costura de IA (v2):** respostas gravadas estruturadas em `flow_state.collected`; promoção por sinal explícito `qualified` (name+phone), não "chegou no fim"; transcript engine-agnóstico. Trocar `advanceFlow` (em `_shared/webchat-flow.ts`) pelo `ai_agents` é a única mudança.

## Passos gated (tocam produção — só com "pode aplicar")

1. **Aplicar migration** (`supabase migration up` / apply) — cria as 2 tabelas + `promote_session_to_contact`.
2. **Deploy das 4 edge functions** via CLI (`supabase functions deploy webchat-config webchat-message webchat-messages webchat-heartbeat`).
3. **Preencher o anon key** em `public/webchat/app.html` (`__SUPABASE_ANON_KEY__` → `VITE_SUPABASE_PUBLISHABLE_KEY`; é chave pública, safe). Depois o deploy do frontend (Vercel) serve `/webchat/loader.js` e `/webchat/app.html`.
4. **Seed via UI:** criar 1 widget na CT e 1 na Viagi, apontando cada um pra etapa inicial da sua org.

## Verificação (após gated)

Criar widget → snippet numa página de teste → rodar o roteiro → conferir: sessão em `webchat_sessions` com `flow_state.collected` estruturado; ao completar, contact deduplicado + opportunity na etapa certa com owner do round-robin + thread webchat com transcript + **lead no inbox** + `capi_event_log` com **1** Lead + `integration_events` (outbox). Repetir na Viagi (confirmar isolamento). Rodar auth de Origin em `EDGE_AUTH_ENFORCE=log` primeiro.

## Follow-ups (v1.1+)

OTP/SMS (SMS Token + anti-pumping + `webchat_otp_log`); IA (troca `advanceFlow` pelo `ai_agents`); **cliente enviar foto/áudio** (reusa Storage + AudioRecorder + `transcribe-audio`); **chat pós-captura ao vivo** (atendente↔visitante, com mídia — habilita Realtime); cron de cleanup de sessões `expired/blocked`; enriquecer CAPI com fbc/fbp (capturados na sessão, ainda não propagados).
