# Por que vem 404 no CPF 867.033.115-28 — e por que hoje não sabemos a razão exata

## Resposta direta

O 404 **não é do Seialz**. Ele vem da API externa `https://api.cpf-brasil.org/cpf/{cpf}` (`supabase/functions/_shared/registry/providers.ts`, `lookupCpfBrasil`). O CPF é matematicamente válido (dígitos verificadores conferem), mas o provedor respondeu que não devolve dados para esse número.

Qual dos motivos possíveis foi (CPF não consta na base do provedor, cadastro cancelado/suspenso na Receita, base desatualizada, ou restrição do plano) **hoje é impossível afirmar** — e isso é uma lacuna de instrumentação nossa, não uma dedução que eu possa fazer com honestidade:

- `normalizeCpfBrasilResponse` colapsa `400`, `404` e `422` — e também os códigos documentados `MISSING_CPF_PARAMETER`, `INVALID_CPF_FORMAT` e `CPF_NOT_FOUND` — em um único `error = "invalid_or_not_found"`.
- O corpo da resposta do provedor (`code`, `message`) é descartado: nada dele é gravado em `registry_lookup_audit` nem logado.
- Em `registry_lookup_audit` só sobra `http_status = 404` e `error_code = "invalid_or_not_found"`.
- Nos logs da função `registry-lookup` não há nenhuma linha da consulta — apenas `booted`/`shutdown`.

Ou seja: a informação que responderia "por que não vem os dados" foi jogada fora no momento da chamada.

## O que fazer para responder de fato

1. **Preservar o diagnóstico do provedor**
   - Em `getJson`/`lookupCpfBrasil`, capturar `code` e `message` do corpo de erro e propagá-los no `ProviderResult` como `provider_code` / `provider_message`.
   - Persistir esses campos em `registry_lookup_audit` (coluna nova `provider_error` jsonb, sem PII) e logar uma linha estruturada em `registry-lookup` com CPF mascarado.

2. **Separar "não encontrado" de "inválido"**
   - `INVALID_CPF_FORMAT` / `MISSING_CPF_PARAMETER` → `invalid`.
   - `CPF_NOT_FOUND` e `404` sem código → `not_found`.
   - `403`/`PLAN_*` → `provider_denied`.

3. **Corrigir a UX no formulário de contato**
   - `src/pages/contacts/ContactForm.tsx` hoje mostra "CPF inválido" para `not_found`. Passar a exibir "CPF não localizado na base consultada" e **permitir salvar** quando o CPF passa na validação local, mantendo `cpf_verification_status` como `not_found` em vez de `invalid`.

4. **Reconsultar esse CPF depois do item 1** para ver o código real do provedor e, se for `CPF_NOT_FOUND`, escalar com o fornecedor (ou avaliar provedor secundário para fallback).

## Nota técnica

Nada acima foi aplicado. Arquivos envolvidos: `supabase/functions/_shared/registry/providers.ts`, `supabase/functions/registry-lookup/index.ts`, `src/pages/contacts/ContactForm.tsx`, `src/lib/regional.ts`, mais uma migration para o campo de auditoria.
