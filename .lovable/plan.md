# Auditoria read-only — erro ao clicar em "Ver QR" (Evolution WhatsApp)

## Rastreamento do fluxo

1. **Componente/hook**: `src/components/integrations/evolution-whatsapp/EvolutionProvisionPanel.tsx` → botão "Ver QR" chama `onRegenerate(instanceName)` → `useConnectInstance()` de `src/hooks/useEvolutionInstances.ts`.
2. **Edge Function/op**: `evolution-instance-manager`, op `connect` (`callManager({ op: "connect", instanceName })`). Não é a op `connectInstance` de `sales-route-operations`.
3. **Request à Evolution**: `GET {EVOLUTION_URL}/instance/connect/{instanceName}` via `evolutionConnect` (`supabase/functions/_shared/evolution/client.ts:242`), com retry.
4. **HTTP status upstream**: 200 (sucesso). Não há falha de rede — o QR foi gerado.
5. **Body upstream**: forma `EvolutionQrCode` (`_shared/evolution/types.ts:34-41`): `{ pairingCode, code, base64, count }`, onde **`code` é a string bruta de pareamento do WhatsApp** (`2@Ud4ky…`), longa e sensível.
6. **Transformação no backend**: `supabase/functions/evolution-instance-manager/index.ts:328` faz `if ("code" in r) return errFromEvolution(r);`. O discriminante escolhido (`"code" in r`) é ambíguo: `EvolutionError` tem `code`, mas **a resposta de sucesso do QR também tem `code`**. Logo, todo QR válido é classificado como erro. `errFromEvolution` responde `{ error: r.code /* = string do QR */, message: r.message /* undefined */ }` com `status: e.status` — que é `undefined` no objeto de QR, então o `Response` sai com **HTTP 200**.
7. **Decisão sucesso/erro no frontend**: `callManager` (`useEvolutionInstances.ts`) considera erro qualquer body com a chave `error` e lança `new Error(err.message || err.error)`. Como `message` é `undefined`, cai no `err.error` = string bruta do QR. `onRegenerate` faz `toast.error((e as Error).message)`.
8. **Por que a string enorme no toast**: é exatamente o campo `code` da resposta de sucesso, promovido a "código de erro" pelo backend e a mensagem de toast pelo frontend.
9. **Natureza da string**: é o **WA linking code** (payload bruto do QR) — não é base64 de imagem, não é pairing code curto, não é stack de erro, não é token de API. É dado sensível: `_shared/evolution/logger.ts:16` já o trata como campo a redigir em logs, e ele está sendo exibido em tela.
10. **Estado real vs. local**: a sessão realmente está sem sessão ativa no servidor (Evolution devolveu QR novo). Porém, como o retorno é abortado antes do `update`, `last_known_state`/`last_qr_expires_at` **não são atualizados** nesse clique — a linha permanece `close`/"Aguardando QR" e a expiração fica stale. A instância 7020 não é afetada (já `open`, caminho diferente).
11. **Comportamento correto**: renderizar o QR quando `base64` existir; quando não existir, mensagem curta e amigável; nunca exibir `code`/base64/token cru em toast.

## Entrega

```text
ROOT_CAUSE=Discriminante de erro ambíguo em evolution-instance-manager op "connect" (`if ("code" in r)`): a resposta de sucesso do QR contém o campo `code` (WA linking code) e é convertida em erro, cujo "código" é a própria string do QR.
UPSTREAM_STATUS=200 (Evolution respondeu com QR válido)
UPSTREAM_BODY_SHAPE={ pairingCode: string|null, code: string|null (QR bruto), base64: string|null, count: number }
BACKEND_RESULT=HTTP 200 com { error: "<string bruta do QR>", message: undefined } (status undefined em errFromEvolution → 200); update de last_known_state/last_qr_expires_at não executado
FRONTEND_MISINTERPRETATION=callManager trata presença de `error` como falha e usa `err.message || err.error`; sem `message`, o toast recebe a string bruta do QR
QR_AVAILABLE=YES
STATE_STALE=YES (linha em evolution_instances não é atualizada nesse clique)
SAFE_FIX_AVAILABLE=YES
```

## Correção mínima proposta (não implementar sem aprovação)

Uma linha de backend, sem mudança de contrato nem de UI de negócio:

1. `supabase/functions/evolution-instance-manager/index.ts:328` — trocar `if ("code" in r)` por `if (isEvolutionError(r))`, o mesmo type guard já usado em `sales-route-operations` (`index.ts:600-607`). Com isso o QR segue pelo caminho de sucesso, `last_known_state = 'connecting'` e `last_qr_expires_at` voltam a ser gravados, e a resposta 200 volta a ser `{ pairingCode, base64, count }`.
2. Revisar o mesmo padrão ambíguo nas linhas 240, 252 e 406 do mesmo arquivo (as respostas ali não têm `code` no topo hoje, então é endurecimento preventivo, não correção de bug).
3. Endurecimento defensivo no frontend (opcional, 2 linhas em `EvolutionProvisionPanel.tsx`): nos toasts de erro do QR, exibir mensagem curta fixa ("Não foi possível gerar o QR Code. Tente novamente.") e truncar qualquer detalhe cru, para que nenhum payload volte a aparecer em tela.

Fora de escopo: SQL, flags, `sales-route-operations`, rotas, número ativo, Atendimento.

Validação após aprovação: deploy da função, clique em "Ver QR" na instância pendente (QR deve renderizar), e conferência de que a linha em `evolution_instances` passa a `connecting` com nova expiração.
