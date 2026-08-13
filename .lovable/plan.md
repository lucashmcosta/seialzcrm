# Switch de número de resposta (Comercial) — contrato final antes da migração

Produção ativa. Nada aqui altera comportamento: feature nasce OFF, tabelas vazias, Atendimento intocado, "Automático" byte-a-byte igual ao fluxo atual.

## Estado da auditoria (read-only, já executada)

```text
PERMISSION_SOURCE=ausente  (communication_endpoints.assigned_user_id NULL em 25/25; messaging_lines.owner_user_id NULL; organization_phone_number_users é só voz)
PERSISTENCE_SOURCE=ausente (message_threads não tem campo por-usuário)
BACKEND_OVERRIDE_READY=NAO (Resolver V2 sobrescreve endpointId explícito no cliente e no servidor)
SCHEMA_CHANGE_REQUIRED=SIM
FEATURE_DEFAULT=OFF
```

## Contrato ajustado (itens 1–10)

**1. Consistência de org no banco.** Não existe unique natural em `users`/`communication_endpoints`/`message_threads` por `(id, organization_id)`, então composite FK exigiria uniques artificiais — descartado. A garantia vem de: (a) `organization_id` NOT NULL nas duas tabelas; (b) **zero privilégio de escrita para `authenticated`** — toda mutação passa por RPC `SECURITY DEFINER` que valida user↔org, endpoint↔org, `channel='whatsapp'`, thread↔org e elegibilidade Comercial; (c) uma única trigger de integridade por tabela (`BEFORE INSERT OR UPDATE`) revalidando as mesmas relações, para que nem `service_role` grave combinação cross-org. Sem triggers além dessas duas.

**2. Sem write direto no frontend.** `GRANT SELECT` apenas; nenhum `INSERT/UPDATE/DELETE` para `authenticated`. RPCs:
- `grant_user_reply_endpoint(_org, _user, _endpoint)` / `revoke_user_reply_endpoint(...)` → exige `can_manage_integrations_in_org(_org)`.
- `set_thread_reply_endpoint_pref(_thread, _endpoint)` → grava só para `current_user_id()`, após validador de elegibilidade.
- `clear_thread_reply_endpoint_pref(_thread)` → DELETE da própria linha.

**3. Leitura administrativa.** Policy de SELECT: `organization_id = ANY(current_user_org_ids()) AND (user_id = current_user_id() OR can_manage_integrations_in_org(organization_id))`. Nunca cross-org.

**4. Elegibilidade Comercial obrigatória.** O endpoint precisa ter link `messaging_line_endpoints.is_active = true` para uma `messaging_lines` da mesma org com `channel='whatsapp'`, `inbox_key='sales'`, `is_active=true`. Endpoint de Atendimento, outro inbox ou outra Route é rejeitado — inclusive linhas pessoais futuras, que devem estar sob linha Comercial.

**5. Permissão ≠ Route.** Para aparecer no switch: `user_reply_endpoints` (usuário autorizado) **E** vínculo Comercial ativo do item 4. Nunca inferir por assignee, owner, `display_name` ou `primary_endpoint_id`.

**6. Manual não pula pipeline.** `manualReplyEndpointId` substitui **somente a escolha de endpoint** (precede o Resolver V2). Continuam valendo: janela 24h, template quando exigido, validações do provider, rate limits, integração válida, endpoint habilitado, Evolution conectada + identidade confirmada, e as demais regras atuais do dispatcher.

**7. Sem fallback silencioso.** Erros explícitos, nunca troca de número: `MANUAL_REPLY_ENDPOINT_FORBIDDEN`, `_NOT_SALES`, `_OFFLINE`, `_IDENTITY_UNKNOWN`, `_IDENTITY_MISMATCH`, `_INACTIVE`, `_CROSS_ORG`.

**8. Flag como barreira server-side.** `sales_manual_reply_endpoint_v1` com `is_enabled=false`, `organization_ids='{}'`. Semântica única escolhida: flag OFF + campo ausente ⇒ fluxo atual byte-a-byte; flag OFF + `manualReplyEndpointId` presente ⇒ `MANUAL_REPLY_FEATURE_DISABLED`. Validado no servidor, não só na UI.

**9. Persistência por thread/usuário.** Sem linha ⇒ Automático. Com linha válida ⇒ endpoint manual. "Voltar para Automático" **remove** a linha (sem endpoint sentinela/NULL). Jamais toca `primary_endpoint_id`, `active_endpoint_id` ou `messaging_line_rotations`.

**10. Auditoria.** `messages.endpoint_id` + `sender_user_id` + `metadata.reply_endpoint_choice = 'manual' | 'auto'`; quando manual, também `manual_reply_endpoint_id` e `chosen_by_user_id`. Nada sensível.

## 11. Migração final (a apresentar para aprovação, ainda não executada)

Um único bloco, sem backfill, sem org habilitada, sem ativar o switch:

1. `create table public.user_reply_endpoints` — `organization_id`, `user_id`, `endpoint_id`, `granted_by_user_id`, timestamps, `unique(organization_id, user_id, endpoint_id)`.
2. `create table public.thread_reply_endpoint_prefs` — `organization_id`, `thread_id`, `user_id`, `endpoint_id`, timestamps, `unique(thread_id, user_id)`.
3. Grants: `GRANT SELECT ... TO authenticated`; `GRANT ALL ... TO service_role`; nenhum write para `authenticated`.
4. `ENABLE ROW LEVEL SECURITY` + policies de SELECT do item 3 nas duas tabelas.
5. Função `public.fn_is_sales_eligible_endpoint(_org, _endpoint) returns boolean` (STABLE, SECURITY DEFINER, `search_path=public`) com a regra do item 4 — fonte única usada por RPCs, triggers e leitura da UI.
6. Duas triggers de integridade cross-org (uma por tabela) usando a função acima.
7. Quatro RPCs `SECURITY DEFINER` do item 2, com `REVOKE EXECUTE FROM anon` e `GRANT EXECUTE TO authenticated`.
8. Trigger `update_updated_at_column` nas duas tabelas.
9. `insert into public.feature_flags (name, description, is_enabled, organization_ids) values ('sales_manual_reply_endpoint_v1', ..., false, '{}') on conflict do nothing`.

Rollback correspondente em `supabase/rollback/`.

## Implementação (depois da migração, com flag OFF)

1. `supabase/functions/_shared/manual-reply-endpoint.ts` — validador único server-side: flag, org, permissão, elegibilidade Comercial, `is_active`, integração, Evolution conectada + identidade. Retorna endpoint ou erro tipado do item 7.
2. Dispatchers (`src/lib/dispatchWhatsAppSend.ts` e `supabase/functions/_shared/dispatch-whatsapp-send.ts`): novo campo `manualReplyEndpointId`; quando presente e flag ON, valida e fixa o endpoint **antes** do Resolver V2, sem desligar nenhuma outra regra; quando ausente, caminho atual inalterado.
3. Metadata de auditoria do item 10 nas functions de envio.
4. UI só Comercial e só com flag ON: seletor discreto "Responder por: Automático ▾" no composer, listando apenas endpoints que satisfaçam permissão + elegibilidade, com "Voltar para Automático". Header e Atendimento intocados.
5. Tela administrativa de concessão (Configurações) consumindo as RPCs — sem write direto.

## 12. Regressão obrigatória com flag OFF (antes de qualquer ativação)

`VIAGI_COMERCIAL`, `CENTRAL_COMERCIAL`, `ATENDIMENTO`, `META`, `TWILIO`, `EVOLUTION`, `INBOUND_CANONICAL`, `OUTBOUND_CURRENT_BEHAVIOR` — todos PASS, mais provas de: zero alteração de `active_endpoint_id`, zero linhas novas em `messaging_line_rotations`, zero mudança de `endpoint_id` em mensagens reais, e UI do switch invisível. Ativação por organização só depois, com sua autorização.

## PARTE B — Auditoria de Configurações (read-only, entrega seguinte)

Documento sem nenhuma reorganização: mapa real de Meta, Twilio e Evolution (credenciais, números, webhooks, templates, onde cada um é configurado hoje); criação automática de Contato; criação de Oportunidade; Round Robin; reabertura de thread/oportunidade; fronteira Comercial vs Atendimento (`purpose`, `business_context`, Route/`inbox_key`); permissões; integrações duplicadas e configurações espalhadas. Proposta de árvore nova apenas como proposta, sem mover nada até sua aprovação.
