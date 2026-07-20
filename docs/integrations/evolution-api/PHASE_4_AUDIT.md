# Evolution API — Fase 4: Auditoria (UI Administrativa + Onboarding)

Data: 2026-07-20
Escopo: construir a UI administrativa completa para configurar e gerenciar
o provider Evolution API, mantendo o sistema totalmente inerte em produção.
Nenhum fluxo funcional (Meta, Twilio, dispatcher, composer, threads,
mensagens) foi tocado.

---

## 1. Componentes criados

Arquivo único (a UI é enxuta e vive numa página só do Admin):

- `src/pages/admin/AdminEvolution.tsx` — página administrativa.
  Componentes internos:
  - `StateBadge` — badge visual para os quatro estados de conexão
    (`open` / `connecting` / `close` / `unknown`).
  - `InstanceRow` — card por instância com: estado, última verificação,
    última expiração de QR, botões **Conectar / QR**, **Atualizar estado**,
    **Atualizar webhook**, **Desconectar**, **Excluir**, e exibição
    inline do QR Code (base64 → `<img>`).
  - `CreateInstanceCard` — formulário com validação de nome
    (`^[A-Za-z0-9_-]{3,64}$`) que chama `op=create` no manager.
  - `HealthCheckCard` + `HealthButton` — chama `op=fetch` no manager e
    reporta conectividade com o servidor Evolution (conta instâncias).
  - Página principal `AdminEvolution` — banner de flag desligada, listas
    de instâncias e de endpoints com `provider='evolution_api'`.

Estados cobertos por skeleton, alert, empty state, loading, disabled,
toast de sucesso/erro e diálogo de confirmação para exclusão.

---

## 2. Hooks criados

- `src/hooks/useEvolutionInstances.ts`
  - `useEvolutionInstances` — React Query, lista `evolution_instances`.
  - `useEvolutionEndpoints` — React Query, lista
    `communication_endpoints` com `provider='evolution_api'`.
  - `useEvolutionManager` — helper `callManager<T>()` que invoca a Edge
    Function `evolution-instance-manager` com tratamento de erro
    padronizado (`FunctionsHttpError` + payload `{error, message}`).
  - Mutations: `useCreateInstance`, `useConnectInstance`,
    `useLogoutInstance`, `useDeleteInstance`, `useConnectionState`,
    `useWebhookSet`. Todas invalidam as queries relevantes no sucesso.
  - Tipos exportados: `EvolutionConnectionState`,
    `EvolutionInstanceRow`, `EndpointLite`.

Nenhum outro hook do projeto foi criado, alterado ou removido.

---

## 3. Rotas criadas

- `GET /admin/evolution` — página administrativa, protegida por
  `AdminProtectedRoute`. Lazy-loaded como todas as outras admin pages.

Nenhuma rota tenant/CRM foi criada. Nenhum item de menu tenant foi
adicionado. A tela não é acessível a usuários não-admin.

---

## 4. Arquivos alterados

Criados:

- `src/pages/admin/AdminEvolution.tsx`
- `src/hooks/useEvolutionInstances.ts`
- `supabase/functions/_shared/evolution/rate-limit.ts`
- `docs/integrations/evolution-api/PHASE_4_AUDIT.md` (este relatório).

Modificados:

- `src/App.tsx` — registro de `AdminEvolution` (lazy import + rota
  `/admin/evolution`). Nenhuma outra rota tocada.
- `supabase/functions/evolution-webhook/index.ts` — troca da fonte de
  autenticação para `EVOLUTION_WEBHOOK_SECRET`; adição de rate limit;
  novo header aceito `x-evolution-webhook-secret`; bloco de comentário
  `PREP: Idempotência persistente` marcando o ponto de troca para Fase 5.
- `supabase/functions/evolution-instance-manager/index.ts` — adição de
  rate limit no início do handler (antes de qualquer efeito). Nenhuma
  operação, contrato ou resposta funcional foi alterada.

Nenhum arquivo em `src/components/`, `services/whatsapp.ts`,
`lib/dispatchWhatsAppSend.ts`, `resolveComposerProvider.ts`, composer,
inbox, threads, contatos, Meta (`meta-*`), Twilio (`twilio-*`),
dispatcher (`integration-inbound-dispatcher`), ou
`src/integrations/supabase/types.ts` foi tocado.

---

## 5. Migrations criadas

Nenhuma. A Fase 4 não introduziu, alterou ou removeu qualquer objeto de
banco. Todas as tabelas usadas (`evolution_instances`,
`communication_endpoints`, `feature_flags`) já existiam desde a Fase 2.

---

## 6. Ajustes de segurança implementados

1. **Autenticação do webhook em secret dedicado.**
   `evolution-webhook` agora exige exclusivamente
   `EVOLUTION_WEBHOOK_SECRET`. `EVOLUTION_GLOBAL_API_KEY` deixou de ser
   aceita como token do webhook — permanece usada apenas pelo
   `evolution-instance-manager` para falar com o servidor Evolution
   upstream (papéis separados).
   O secret é aceito em (nesta ordem, comparação em tempo constante):
   `x-evolution-webhook-secret`, `x-evolution-token`, `apikey`, `?token=`.
2. **Rate limiting** (ver §8).
3. **UI apenas admin.** A rota `/admin/evolution` está atrás de
   `AdminProtectedRoute`; nenhuma superfície tenant foi criada.
4. **Feature flag ainda bloqueadora.** Toda operação de negócio no
   manager retorna `403 FEATURE_DISABLED` enquanto
   `evolution_api_enabled` estiver desligada — a UI apenas exibe o erro.
5. **Sem persistência de credenciais no cliente.** Nenhum secret é
   lido, exibido ou trafegado pelo frontend. O manager sanitiza a saída
   do `create` (não devolve `hash` da instância ao caller — já era assim
   na Fase 3, mantido).

---

## 7. Confirmação da criação do `EVOLUTION_WEBHOOK_SECRET`

Criado nesta fase via `generate_secret` (64 chars, aleatório
criptográfico), independente de `EVOLUTION_GLOBAL_API_KEY`. Valor não é
exibido, logado, retornado por nenhuma função nem exposto ao frontend.
Presença é verificável via `fetch_secrets`. Se ausente, o webhook
responde `503 MISSING_SECRET` sem processar corpo.

---

## 8. Estratégia de Rate Limiting

Módulo compartilhado novo: `supabase/functions/_shared/evolution/rate-limit.ts`.
Fixed-window in-memory por isolate, chaveado por IP (`x-forwarded-for` →
`cf-connecting-ip` → `x-real-ip` → `"anon"`). Retorna `429` com header
`retry-after` quando estourado. Sem dependência de Redis ou tabela.
Aplicado antes de qualquer efeito colateral (parse de body, auth, chamada
upstream, leitura da flag).

| Função | Limite | Janela | Objetivo |
|---|---|---|---|
| `evolution-instance-manager` | 30 req | 60 s | Corta abuso de painel admin |
| `evolution-webhook` | 120 req | 60 s | Absorve bursts do servidor Evolution |

Notas:
- É uma proteção de primeiro nível — sob carga distribuída (múltiplos
  isolates) o limite é aproximado. Suficiente para impedir floods
  triviais nesta fase.
- Não altera nenhum caminho de sucesso: chamadas dentro do limite têm
  latência inalterada.
- Não afeta Meta, Twilio ou dispatcher (código isolado no diretório
  `_shared/evolution/`).

---

## 9. Estratégia preparada para idempotência persistente (Fase 5)

`evolution-webhook` mantém a dedup em memória (`Map` com TTL de 5 min),
já usada na Fase 3, mas foi **explicitamente marcada** para migração:

```ts
// PREP: Idempotência persistente (Fase 5)
// ---------------------------------------
// Na próxima fase, quando o consumo real do webhook for ligado, esta
// verificação deve ser substituída por uma inserção em
// `public.integration_inbound_events` (tabela já existente) com uma
// UNIQUE constraint sobre (provider, event_key). Conflito = duplicata.
// O contrato da `idempotencyKey()` abaixo já produz a chave estável
// que será persistida. Nada mais precisa mudar no restante do handler.
```

- A função `idempotencyKey(env)` já produz a chave estável
  `instance|event|data.key.id||data.id||date_time` — reutilizável sem
  alteração.
- A tabela alvo (`integration_inbound_events`) já existe no banco (42
  colunas, 2 policies) e é o ponto natural de persistência
  cross-provider — nenhuma migration adicional foi antecipada nesta fase
  para não introduzir schema não utilizado.
- Quando a Fase 5 abrir, o único ponto de troca é o corpo de
  `seenRecently()` (memória → insert com `on conflict do nothing`).
  Contrato externo do handler permanece igual.

---

## 10. Evidências de inércia em produção

Verificado após deploy:

- **Nenhuma organização ativada.**
  `SELECT organization_ids FROM feature_flags
     WHERE name='evolution_api_enabled'` → `{}` (inalterado desde Fase 2).
- **Nenhuma feature flag ligada.**
  `SELECT is_enabled FROM feature_flags
     WHERE name='evolution_api_enabled'` → `false` (inalterado).
- **Nenhum endpoint em produção com provider Evolution.**
  `SELECT count(*) FROM communication_endpoints
     WHERE provider='evolution_api'` → `0` (inalterado).
- **Nenhuma `messaging_line` alterada.**
  `SELECT count(*) FROM messaging_lines ml
     JOIN communication_endpoints ce ON ce.id = ml.active_endpoint_id
    WHERE ce.provider='evolution_api'` → `0` (inalterado).
- **Nenhuma `evolution_instances` criada automaticamente.**
  `SELECT count(*) FROM evolution_instances` → `0` (inalterado). A UI
  Fase 4 lista o que houver, mas não popula nada automaticamente:
  `op=create` no manager só fala com o servidor Evolution e não insere
  em `evolution_instances` (isso é reservado à Fase 5).
- **Nenhum fluxo Meta alterado** — nenhum arquivo em
  `supabase/functions/meta-*` ou `_shared/meta-whatsapp/*` foi editado.
- **Nenhum fluxo Twilio alterado** — nenhum arquivo em
  `supabase/functions/twilio-*` ou `_shared/twilio-signature.ts` foi
  editado.
- **Nenhuma mensagem enviada** — nenhum código de envio existe no
  cliente Evolution; `services/whatsapp.ts`,
  `lib/dispatchWhatsAppSend.ts`, `resolveComposerProvider.ts`, hooks do
  composer e componentes de inbox/threads seguem inalterados.
- **Nenhuma mensagem recebida** — o webhook continua retornando `202
  FEATURE_DISABLED` sem gravar em `messages`, `message_threads`,
  `contacts` ou `evolution_instances`. O servidor Evolution na Vultr
  não tem seu webhook apontado para esta função em produção nesta fase
  (nenhuma chamada `webhookSet` foi disparada contra prod). Se o
  operador chamar `webhookSet` pela UI admin, a URL apontada
  (`.../functions/v1/evolution-webhook`) continuará respondendo 202 sem
  efeito, pois a flag permanece desligada.
- **Nenhum dispatcher alterado.** Zero linhas mudadas em
  `integration-inbound-dispatcher`, filas, jobs de outbound, cron ou
  automações.
- **Nenhuma integração existente mudou.** A tela `/admin/integrations`,
  `AdminIntegrationDetail`, endpoints Meta/Twilio, WABA, número
  principal e composer permanecem exatamente como antes.
- **`active_endpoint_id` inalterado.** A UI Fase 4 não expõe nenhuma
  operação sobre `messaging_lines` — não há UI para trocar
  `active_endpoint_id`.

---

## 11. Fora do escopo desta fase (reafirmado)

- Nenhum consumo produtivo do webhook (persistir mensagens, atualizar
  `last_known_state`, upsert de `evolution_instances`).
- Nenhum registro automático em `communication_endpoints` ou
  `messaging_lines` ao criar uma instância remota.
- Nenhum mapeamento persistente `instance_name → organization_id /
  endpoint_id`.
- Nenhum envio de mensagens.
- Nenhuma ativação de tenant, nenhuma inclusão em
  `feature_flags.organization_ids`.
- Nenhum teste executado contra a instância Evolution em produção
  além do que o operador administrativo dispare voluntariamente pela
  nova UI (que continua bloqueada pela flag).

---

## 12. Gate para iniciar a Fase 5

Todos abaixo devem estar verdes antes de abrir a próxima fase:

- [x] `EVOLUTION_WEBHOOK_SECRET` criado e usado exclusivamente pelo
      `evolution-webhook`.
- [x] Rate limiting ativo nas duas Edge Functions Evolution.
- [x] Bloco `PREP: Idempotência persistente` presente e localizado no
      ponto de troca da Fase 5.
- [x] Rota `/admin/evolution` disponível e protegida por
      `AdminProtectedRoute`.
- [x] Zero linhas em `evolution_instances`; zero endpoints
      `provider='evolution_api'`; zero `messaging_lines` apontando para
      Evolution; flag `evolution_api_enabled` `is_enabled=false`,
      `organization_ids='{}'`.
- [x] Nenhum arquivo em Meta, Twilio, dispatcher, composer, inbox,
      threads, contatos ou services de WhatsApp foi tocado.
- [ ] Aprovação explícita do owner para iniciar a Fase 5.

---

## 13. Rollback

Reversível sem migration:

1. Remover a rota `/admin/evolution` e o import em `src/App.tsx`.
2. Deletar `src/pages/admin/AdminEvolution.tsx` e
   `src/hooks/useEvolutionInstances.ts`.
3. Deletar `supabase/functions/_shared/evolution/rate-limit.ts`.
4. Reverter `supabase/functions/evolution-webhook/index.ts` e
   `supabase/functions/evolution-instance-manager/index.ts` para as
   versões da Fase 3.
5. Revogar `EVOLUTION_WEBHOOK_SECRET` via `delete_secret` (opcional; o
   secret ficar armazenado sem uso não tem efeito colateral).

Nenhum dado precisa ser restaurado — a Fase 4 não escreveu em nenhuma
tabela.

---

Aguardando aprovação explícita para iniciar a Fase 5.
