# Token interno aceito sem conferir a assinatura — 2026-11-18

## O problema

`supabase/functions/_shared/auth.ts` → `validateServiceRoleAuth` reconhece uma
chamada interna de duas formas: o token é igual à `SUPABASE_SERVICE_ROLE_KEY`
da função, **ou** é um JWT cujas claims dizem `role: service_role`,
`iss: supabase`, `ref` do projeto e não expirado. No segundo caso a assinatura
do JWT não é verificada.

Quando a função tem `verify_jwt = true`, o gateway do Supabase verifica a
assinatura antes de a função rodar. Mas a convenção deste repositório é
`verify_jwt = false` com "a autenticação acontece dentro da função". Nessas
funções ninguém verifica: um token montado por qualquer pessoa, com essas quatro
claims e uma assinatura qualquer, passa como chamada interna. O `ref` do projeto
é público (está na URL).

Reproduzido localmente, sem tocar em produção: um token com assinatura
inventada devolve `ok: true` (o teste `auth.test.ts` deixa isso registrado).

## Alcance

Funções que usam o helper (direto ou por `validateCallerAuth`) **com
`verify_jwt = false`**:

| Função | O que um chamador aceito como interno consegue |
|---|---|
| `dispatch-whatsapp-send` | enviar WhatsApp em nome de qualquer organização |
| `meta-whatsapp-send`, `twilio-whatsapp-send` | idem (hoje também abertas pelo `EDGE_AUTH_ENFORCE=log`) |
| `ai-agent-respond` | acionar o agente numa conversa |
| `marketing-campaign-enrich`, `plamev-quote`, `telephony-transfer-reconcile` | executar a rotina |

As que não têm entrada no `config.toml` (`agent-followups`,
`scheduled-messages-cron`, `meta-lead-ads-*`, `evolution-whatsapp-send`) usam o
padrão da CLI, `verify_jwt = true`, e ficam protegidas pelo gateway — desde que
o deploy respeite esse padrão.

A chave interna em si **não vaza**: `get_internal_function_auth_token()` está
fechada para `anon` e `authenticated` em produção (conferido).

## A correção

`verifyServiceRoleAuth(req)` só reconhece as duas chaves internas de verdade,
por igualdade exata e em tempo constante:

1. `SUPABASE_SERVICE_ROLE_KEY`, a variável de ambiente da função;
2. a chave do cofre que os jobs do `pg_cron` enviam
   (`get_internal_function_auth_token()`), lida com o cliente de serviço e
   guardada em memória por 5 minutos.

Não decodifica o token nem confia nas claims. As oito funções que chamavam
`validateServiceRoleAuth` e o `validateCallerAuth` passam a usar a nova.

## Rollout em duas fases

Bloquear de uma vez é arriscado: se algum chamador legítimo usa uma terceira
chave (um job antigo com o token escrito no comando, por exemplo), ele pararia —
como no incidente de 18/11 com a chave no formato novo. Por isso, o mesmo
desenho do `EDGE_AUTH_ENFORCE`:

| `SERVICE_AUTH_STRICT` | Comportamento |
|---|---|
| `log` (padrão) | aceita como hoje, e registra `[AUTH] service_token_would_deny` quando o token não é chave conhecida |
| `enforce` | só aceita chave conhecida |

**Enquanto estiver em `log`, a falha continua aberta.** Passos:

1. Publicar com o padrão (`log`).
2. Observar os logs por 24–48 h. Cada `service_token_would_deny` traz a função,
   o `user-agent` e as claims (nunca o token): é um chamador que usa uma chave
   desconhecida, ou uma tentativa.
3. Corrigir os chamadores legítimos que aparecerem (trocar pela chave do cofre).
4. `SERVICE_AUTH_STRICT=enforce`.

Se o cofre estiver inacessível, a função aceita pelas claims e registra
`service_token_vault_unavailable`: uma falha do cofre não pode parar os jobs.
Esse aviso em produção precisa de atenção, porque nesse estado o bloqueio não
vale.

## Depois

- Unificar com `_shared/integrations/internal-auth.ts` (PR dos avisos da
  integração Nammux), que faz a mesma conferência para o worker novo.
- Avaliar `verify_jwt = true` nas funções que só recebem chamada interna.
