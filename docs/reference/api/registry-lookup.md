# Registry Lookup — contrato de erros do provedor

Edge Function: `registry-lookup` (`POST`), tipos `cep`, `cnpj`, `cpf`.

## Resposta de falha

```json
{
  "ok": false,
  "kind": "cpf",
  "provider": "cpf-brasil",
  "error": "not_found",
  "retryable": false,
  "provider_code": "CPF_NOT_FOUND",
  "provider_message": "CPF [redacted] não encontrado"
}
```

- `error` — categoria interna do Seialz.
- `provider_code` / `provider_message` — código e mensagem originais do provedor, sanitizados (sequências longas de dígitos e credenciais são substituídas por `[redacted]`, mensagem truncada em 300 caracteres).

## Categorias internas (CPF)

| `error` | Significado | `cpf_verification_status` |
| --- | --- | --- |
| `invalid_cpf_format` | CPF malformado / dígitos verificadores inválidos | `invalid` |
| `not_found` | CPF matematicamente válido, sem dados na base do provedor | `not_found` |
| `provider_auth_error`, `provider_token_expired`, `provider_plan_*` | credencial/plano do provedor | `error` |
| `provider_quota_exceeded`, `upstream_error`, `timeout`, `network_error` | indisponibilidade | `error` |
| `provider_not_configured`, `provider_missing_api_key` | configuração ausente | `error` |

`invalid_or_not_found` é aceito apenas como valor legado em registros antigos.

## Persistência

- `registry_lookup_audit`: `error_code`, `provider_code`, `provider_message`.
- `contact_identity_profiles`: `last_error_code`, `last_provider_code`, `last_provider_message`, `last_failure_class`.

## UI (formulário de contato)

- `verified` → verde.
- `invalid` → vermelho ("CPF inválido — verifique os dígitos").
- `not_found` → âmbar, não bloqueante; o contato pode ser salvo.
- `error` → cinza ("Consulta indisponível").

Em qualquer falha, o motivo do provedor aparece como texto secundário: `provider_code — provider_message`.
