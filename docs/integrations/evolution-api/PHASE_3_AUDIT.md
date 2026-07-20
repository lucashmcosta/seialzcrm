# Evolution API — Fase 3: Relatório de Auditoria (backend aditivo)

Data: 2026-07-20
Escopo: implementar apenas a infraestrutura de backend necessária para
suportar o provider Evolution API no futuro. Nada é consumido em produção.

Fase autorizada exclusivamente à camada de Edge Functions e helpers
`_shared`. Fases 4 (UI), 5 (piloto Viagi) e 6 (rollout) permanecem
bloqueadas. Nenhum fluxo produtivo (Meta / Twilio / dispatcher) foi tocado.

---

## 1. Edge Functions criadas

Duas funções novas em `supabase/functions/`:

1. **`evolution-instance-manager/index.ts`**
   - Superfície administrativa (JWT obrigatório).
   - Operações suportadas via `op`:
     `create`, `delete`, `connect`, `logout`, `connectionState`,
     `webhookSet`, `webhookFind`, `fetch`.
   - Cada `op` valida `instanceName` contra `^[A-Za-z0-9_-]{3,64}$`
     (previne path injection) e valida o corpo de `webhookSet` contra a
     lista fechada de eventos aceitos.
   - Não persiste nada no banco Seialz. Não cria endpoints,
     `messaging_lines` nem `evolution_instances`. Apenas fala com o
     servidor Evolution upstream.
   - Enquanto `evolution_api_enabled` estiver desligada (global e por org),
     retorna 403 `FEATURE_DISABLED` **antes** de qualquer chamada HTTP.

2. **`evolution-webhook/index.ts`**
   - `verify_jwt = false` — auth em código via token compartilhado.
   - Recebe eventos `CONNECTION_UPDATE`, `QRCODE_UPDATED`,
     `MESSAGES_UPSERT`, `MESSAGES_UPDATE` (contratos vistos na Fase 0).
   - Valida estrutura mínima do envelope, computa chave de idempotência
     (`instance|event|data.key.id||data.id||date_time`) e derruba
     duplicatas dentro de uma janela de 5 minutos no isolate.
   - **Nunca grava mensagens, contatos, threads, endpoints ou instâncias
     nesta fase.** Enquanto a flag estiver desligada: retorna 202 com
     `reason: FEATURE_DISABLED` e um log informativo. Se a flag ligar,
     ainda assim retorna 200 sem gravar — o consumo real fica para a
     Fase 4.

Nenhuma outra Edge Function foi criada, alterada ou removida.

---

## 2. Arquivos alterados

Criados:

- `supabase/functions/_shared/evolution/types.ts` — tipos + versão do
  contrato de webhook (`v1`).
- `supabase/functions/_shared/evolution/logger.ts` — logger estruturado
  com redação obrigatória (apikey, token, hash, base64, Authorization,
  x-discovery-token, x-api-key, code, pairingCode).
- `supabase/functions/_shared/evolution/client.ts` — cliente HTTP
  reutilizável (timeout, retry limitado, sanitização de baseUrl).
- `supabase/functions/_shared/evolution/provider.ts` — camada de
  abstração `EvolutionProvider` (o contrato que dispatcher/UI passarão
  a consumir em fases futuras).
- `supabase/functions/evolution-instance-manager/index.ts`.
- `supabase/functions/evolution-webhook/index.ts`.
- `docs/integrations/evolution-api/PHASE_3_AUDIT.md` (este relatório).

Alterados:

- `supabase/config.toml` — adicionado bloco
  `[functions.evolution-webhook] verify_jwt = false`. Nenhum outro
  bloco foi tocado.

Nenhum arquivo em `src/`, `services/whatsapp.ts`,
`lib/dispatchWhatsAppSend.ts`, `lib/resolveComposerProvider.ts`, hooks
de composer, componentes de UI, ou funções pré-existentes
(`meta-*`, `twilio-*`, `integration-inbound-dispatcher`, …) foi tocado.
`src/integrations/supabase/types.ts` não foi editado.

Nenhuma migration foi criada nesta fase. Nenhum secret foi
adicionado, alterado ou removido.

---

## 3. Rotas expostas

| Método | Rota | Auth | Consumo produtivo |
|---|---|---|---|
| POST | `/functions/v1/evolution-instance-manager` | JWT + `evolution_api_enabled` | Nenhum (flag off) |
| POST | `/functions/v1/evolution-webhook` | Token compartilhado (`apikey` / `x-evolution-token` / `?token=`) | Nenhum (não grava) |
| OPTIONS | ambas | — | Preflight CORS |

Ambas ignoram qualquer outro método com `405 METHOD_NOT_ALLOWED`.

---

## 4. Secrets utilizados

Apenas nomes (nenhum valor é lido, logado ou copiado):

- `EVOLUTION_BASE_URL` — base do servidor Evolution (Vultr).
- `EVOLUTION_GLOBAL_API_KEY` — apikey global do servidor; também aceita
  o mesmo valor como token de autenticação do webhook inbound.
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` —
  padrão da plataforma (para checagem de JWT e leitura da feature flag).

Se qualquer secret Evolution estiver ausente, as funções respondem
`503 MISSING_SECRET` sem chamar o upstream.

Nenhum secret novo foi adicionado. Nenhum secret existente foi alterado.

---

## 5. Estratégia de autenticação

- **`evolution-instance-manager`**: `Authorization: Bearer <jwt>`
  obrigatório. JWT é validado via `supabase.auth.getClaims(token)`.
  Após autenticado, aplica-se o gate da feature flag (por org ou global)
  antes de qualquer efeito.
- **`evolution-webhook`**: `verify_jwt = false`. Auth é feita em código
  contra `EVOLUTION_GLOBAL_API_KEY`, aceitando o token em (nesta ordem)
  `x-evolution-token`, `apikey`, `?token=`. Comparação em tempo constante
  (`safeEqual`) para evitar timing attacks. Sem token válido → 401 sem
  processar body.

Nenhum caller anônimo pode acionar operações administrativas.
Nenhum atacante sem o token global pode inserir eventos falsos no
webhook.

---

## 6. Estratégia de timeout

- Timeout explícito de **15s** por chamada HTTP ao upstream Evolution,
  implementado com `AbortController`. Timeout expirando → resposta
  padronizada `504 UPSTREAM_TIMEOUT`.
- Nenhuma chamada usa `fetch` sem `signal`.
- `supabase.auth.getClaims` e leituras do banco (feature flag) herdam
  o timeout do runtime da Edge Function; não há loops de espera.

---

## 7. Estratégia de retry

- Retry apenas em operações **outbound** e **idempotentes** do cliente:
  `serverInfo`, `fetchInstances`, `connect`, `connectionState`,
  `webhookFind`, `webhookSet`.
- Operações mutáveis não-idempotentes (`createInstance`, `delete`,
  `logout`) **não** re-tentam.
- Máximo de 3 tentativas, backoff exponencial `300ms · 2^i` + jitter
  ≤100ms. Só re-tenta em `UPSTREAM_TIMEOUT`, `UPSTREAM_5XX` ou
  `UPSTREAM_ERROR` (falha de rede). `4xx` é definitivo.
- Nenhum loop infinito. Nenhum retry client-side no webhook inbound.

---

## 8. Estratégia de idempotência

- **Webhook inbound**: chave computada como
  `instance|event|data.key.id||data.id||date_time`. Duplicatas dentro de
  5 minutos no isolate retornam `200 { duplicate: true }` sem
  reprocessar. GC oportunístico limita o mapa a ~5k entradas.
- **Instance manager**: `webhookSet` é upsert idempotente na Evolution;
  `delete` foi observado idempotente na Fase 0 (retorna 200 mesmo
  quando a instância já não existe). `create` não é idempotente e
  intencionalmente não re-tenta.
- Nenhuma tabela nova foi criada para persistir idempotência nesta fase.
  Quando o processamento real for ligado (Fase 4), a chave será
  persistida em `integration_inbound_events`.

---

## 9. Estratégia de observabilidade

- Todos os logs passam por `logEvolution(level, fields)` que serializa
  JSON estruturado com: `ts`, `level`, `fn`, `op`/`event`, `requestId`,
  `instanceName`, `orgId`, `status`, `durationMs`, `code`, `message`,
  `ctx` (redigido).
- Cada request gera um `requestId` (UUID v4) propagado do handler para o
  cliente HTTP, permitindo correlacionar linhas em Edge Function logs.
- Redação obrigatória cobre: `apikey`, `api_key`, `apiKey`, `token`,
  `hash`, `base64`, `authorization`, `x-discovery-token`, `x-api-key`,
  `code` (WA link code), `pairingCode`. Strings do tipo
  `data:image/...;base64,...` são substituídas por `***REDACTED_BASE64***`.
- Métricas mínimas registradas: latência (`durationMs`) e status por
  operação, código de erro padronizado (`EvolutionErrorCode`).

---

## 10. Tratamento de erros

Erros padronizados via `EvolutionErrorCode`:

| Código | HTTP | Origem |
|---|---|---|
| `FEATURE_DISABLED` | 403 (manager) / 202 (webhook) | Flag desligada |
| `MISSING_SECRET` | 503 | Env ausente |
| `INVALID_INPUT` | 400 | Body/params inválidos |
| `UNAUTHORIZED` | 401 | JWT/token inválido |
| `UPSTREAM_TIMEOUT` | 504 | Abort após 15s |
| `UPSTREAM_5XX` | 5xx | Evolution respondeu 5xx |
| `UPSTREAM_4XX` | 4xx | Evolution respondeu 4xx |
| `UPSTREAM_ERROR` | 504 | Falha de rede |
| `DUPLICATE_EVENT` | 200 (webhook) | Idempotência |
| `UNKNOWN_EVENT` | 200 (webhook) | Evento fora de `KNOWN_EVENTS`, aceito e ignorado |
| `INTERNAL_ERROR` | 500 | Exceção inesperada |

Nenhum erro vaza `apikey`, token de instância, base64 do QR ou `code`
do WA — a redação é feita antes da serialização e o corpo devolvido
ao caller não inclui esses campos.

---

## 11. Evidências de inércia em produção

Verificado após o deploy dos arquivos desta fase:

- **Nenhuma organização ativada**
  `SELECT organization_ids FROM feature_flags WHERE
  name='evolution_api_enabled'` → `{}` (array vazio, inalterado).
- **Nenhuma feature flag ligada**
  `SELECT is_enabled FROM feature_flags WHERE
  name='evolution_api_enabled'` → `false` (inalterado).
- **Nenhum `communication_endpoint` criado**
  `SELECT count(*) FROM communication_endpoints WHERE
  provider='evolution_api'` → `0` (inalterado desde a Fase 2).
- **Nenhuma `messaging_line` alterada**
  `SELECT count(*) FROM messaging_lines ml JOIN
  communication_endpoints ce ON ce.id = ml.active_endpoint_id WHERE
  ce.provider='evolution_api'` → `0` (inalterado).
- **Nenhuma `evolution_instances` criada automaticamente**
  `SELECT count(*) FROM evolution_instances` → `0` (inalterado).
- **Nenhum fluxo Meta alterado** — nenhum arquivo em
  `supabase/functions/meta-*` ou `_shared/meta-whatsapp/*` foi editado.
- **Nenhum fluxo Twilio alterado** — nenhum arquivo em
  `supabase/functions/twilio-*` ou `_shared/twilio-signature.ts` foi
  editado.
- **Nenhuma mensagem enviada** — a função `evolution-instance-manager`
  não possui nenhuma operação de envio; o cliente HTTP não expõe
  `sendText`/`sendMedia`. `services/whatsapp.ts`,
  `lib/dispatchWhatsAppSend.ts` e `resolveComposerProvider.ts` seguem
  inalterados.
- **Nenhuma mensagem recebida** — o webhook responde 202 com
  `reason: FEATURE_DISABLED` e não grava nada em `messages`,
  `message_threads`, `contacts` ou `evolution_instances`. O servidor
  Evolution (Vultr) tampouco tem sua configuração de webhook apontada
  para esta função nesta fase (nenhuma chamada `webhookSet` foi
  disparada em produção).
- **Nenhuma instância criada automaticamente** — `createInstance` só
  é acessível via `evolution-instance-manager` com JWT válido **e**
  flag ligada. Ambos os gates estão fechados hoje.

---

## 12. Fora do escopo desta fase (reafirmado)

- Nenhuma UI (settings, composer, número principal, kanban de instâncias).
- Nenhum consumo pelo dispatcher / composer / hooks.
- Nenhum mapeamento persistente entre `instance` do webhook e
  `organization_id` / `endpoint_id` (fica para a Fase 4, quando o
  processamento real for ligado).
- Nenhum envio de mensagens (`sendText`, `sendMedia`).
- Nenhuma alteração em Meta, Twilio ou nas tabelas
  `communication_endpoints` / `messaging_lines` / `evolution_instances`.
- Nenhuma ativação de tenant, nenhuma inclusão em
  `feature_flags.organization_ids`.
- Nenhum teste executado contra o servidor Evolution em produção nesta
  fase — os contratos usados aqui são exatamente os validados e
  documentados na Fase 0 (`DISCOVERY.md`).

---

## 13. Gate para iniciar a Fase 4

Todos abaixo devem estar verdes antes de abrir a próxima fase:

- [x] Edge Functions `evolution-instance-manager` e `evolution-webhook`
      deployadas e respondendo `FEATURE_DISABLED` como esperado.
- [x] `supabase/config.toml` mantém `verify_jwt=false` apenas para
      `evolution-webhook` (auth em código).
- [x] Nenhum arquivo em `src/`, `services/whatsapp.ts`,
      `lib/dispatchWhatsAppSend.ts`, `resolveComposerProvider.ts`,
      hooks, componentes de UI, `meta-*` ou `twilio-*` foi tocado.
- [x] Zero linhas em `evolution_instances`; zero endpoints com
      `provider='evolution_api'`; zero `messaging_lines` apontando para
      Evolution; flag `evolution_api_enabled` `is_enabled=false` e
      `organization_ids='{}'`.
- [ ] Aprovação explícita do owner para iniciar a Fase 4.

---

## 14. Rollback

Reversível sem migration:

1. Remover os diretórios
   `supabase/functions/evolution-instance-manager/` e
   `supabase/functions/evolution-webhook/`.
2. Remover o diretório `supabase/functions/_shared/evolution/`.
3. Reverter o bloco `[functions.evolution-webhook]` em
   `supabase/config.toml`.
4. Deletar as funções remotas via `supabase--delete_edge_functions`.

Nenhum dado precisa ser restaurado — a Fase 3 não escreveu em nenhuma
tabela.

---

Aguardando aprovação explícita para iniciar a Fase 4.
