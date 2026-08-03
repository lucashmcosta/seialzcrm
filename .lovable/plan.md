# Mostrar o motivo real do provedor em vez de "CPF inválido"

## Situação atual (verificada)

- `normalizeCpfBrasilResponse` (`supabase/functions/_shared/registry/providers.ts`) já recebe o JSON do provedor e lê `json.code`, mas **descarta** esse código e a mensagem: só devolve uma categoria interna (`invalid_or_not_found`, `provider_quota_exceeded`, ...).
- `supabase/functions/registry-lookup/index.ts` colapsa `invalid_or_not_found` e `not_found` na classe `not_found` e grava `cpf_verification_status = 'invalid'` em `contact_identity_profiles`.
- `registry_lookup_audit` guarda apenas `outcome`, `http_status` e `error_code` (categoria interna) — não há coluna para o código/mensagem do provedor.
- `ContactForm.tsx` mostra o texto fixo "CPF não encontrado ou inválido." / "CPF inválido", sem distinguir erro de digitação de "não existe na base".

Conclusão: sim, o Seialz pode armazenar e exibir o `code`/`message` — hoje simplesmente não propaga.

## O que fazer

### 1. Propagar o código/mensagem do provedor
- Em `ProviderResult` (caso de falha), adicionar `provider_code` e `provider_message`, preenchidos com `json.code` e `json.message` (ou equivalente) em `normalizeCpfBrasilResponse`.
- Sanitizar: truncar mensagem (~300 chars) e nunca incluir o CPF completo nem a API key.

### 2. Separar "inválido" de "não encontrado"
- Criar classe de falha `not_found` distinta de `invalid`:
  - `INVALID_CPF_FORMAT` / falha de dígito verificador → `invalid`
  - `CPF_NOT_FOUND` / 404 com CPF matematicamente válido → `not_found`
- Refletir isso em `cpf_verification_status`: usar `not_found` em vez de forçar `invalid`.

### 3. Persistir para auditoria e para a tela
- `registry_lookup_audit`: novas colunas `provider_code` e `provider_message`.
- `contact_identity_profiles`: novas colunas `last_provider_code` e `last_provider_message` (ao lado de `last_error_code`).
- A resposta da Edge Function passa a devolver `error`, `provider_code`, `provider_message`.

### 4. UI do formulário de contato
- Badge/label por estado:
  - `invalid` → "CPF inválido (verifique os dígitos)" (vermelho)
  - `not_found` → "CPF não encontrado na base do provedor" (âmbar, não bloqueante)
  - `error` / cota / auth → "Consulta indisponível" com detalhe do provedor
- Exibir o motivo do provedor em texto secundário ou tooltip (`provider_code — provider_message`).
- Permitir salvar normalmente quando o CPF é matematicamente válido e o resultado é `not_found`.

## Notas técnicas

- Mudanças de banco: 2 migrations pequenas (colunas nullable, sem backfill).
- Enum `cpf_verification_status` já é texto/enum? Verificar antes: se for enum, adicionar valor `not_found`; se for texto, apenas ajustar código.
- Nenhuma alteração no fluxo de RLS ou multi-tenancy.
- Documentar o novo contrato em `docs/` (referência de registry lookup).
