# CPF 867.033.115-28 — qual é o code/message e como ficaria na UI

## O que consegui verificar agora

- `registry_lookup_audit` tem apenas: `outcome`, `http_status`, `error_code` (categoria interna). **Não existe coluna com o `code`/`message` do provedor** — então o motivo real desta consulta específica não está guardado em lugar nenhum e não é recuperável retroativamente.
- `normalizeCpfBrasilResponse` (`supabase/functions/_shared/registry/providers.ts:186-215`) lê `json.code`, usa apenas para mapear categoria e **descarta** code e message.
- O contrato de erro da API é `{ error, message, code }` — confirmado numa chamada sem chave, que devolveu:
  `{"error":"Não autorizado","message":"Chave de API ausente...","code":"MISSING_API_KEY"}`
- Tabela de códigos já mapeada no código: `MISSING_CPF_PARAMETER`, `INVALID_CPF_FORMAT`, `CPF_NOT_FOUND`, `QUOTA_EXCEEDED`, auth/plano.
- Como o CPF passa no dígito verificador e o HTTP foi 404, o código esperado é `CPF_NOT_FOUND` (não `INVALID_CPF_FORMAT`). **[INCERTO]** enquanto não houver uma consulta nova com a propagação ligada — a chave `CPF_BRASIL_API_KEY` não está acessível fora da Edge Function, então não posso reproduzir a chamada aqui.

Resumo: hoje é impossível afirmar o code exato deste CPF; ele passa a ser visível a partir da primeira nova consulta depois da propagação.

## Como ficaria na UI (formulário de contato)

Estado hoje: label vermelho "CPF inválido" + toast "CPF não encontrado ou inválido", salvamento visualmente bloqueado.

Estados propostos:

```text
CPF  [ 867.033.115-28 ]   ⚠ Não encontrado na base
                          CPF_NOT_FOUND — CPF não encontrado (cpf-brasil)
```

- `invalid` (dígito verificador falha / `INVALID_CPF_FORMAT`)
  - Badge vermelho: **CPF inválido — verifique os dígitos**
- `not_found` (404 com CPF matematicamente válido / `CPF_NOT_FOUND`)
  - Badge âmbar: **CPF não encontrado na base do provedor**
  - Texto secundário/tooltip: `CPF_NOT_FOUND — <message do provedor> (cpf-brasil)`
  - Não bloqueia salvar
- cota / auth / indisponibilidade
  - Badge cinza: **Consulta indisponível** + tooltip `QUOTA_EXCEEDED — <message>`
- `verified`
  - Badge verde: **CPF verificado** + data da verificação

Mesmo padrão de rótulo reaproveitado no checklist do `OpportunityCloseDialog` (item `cpf_api_verified`), para "não encontrado" deixar de parecer erro de digitação.

## Notas técnicas (para quando implementar)

- Propagar `provider_code` / `provider_message` em `ProviderResult`, na resposta da Edge Function, em `registry_lookup_audit` e em `contact_identity_profiles`.
- Sanitizar: truncar message (~300 chars), nunca incluir CPF completo nem a API key.
- Verificar se `cpf_verification_status` é enum antes de introduzir `not_found`.
