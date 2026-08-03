# Diagnóstico: CPF 867.033.115-28 aparece como "CPF inválido"

## O que foi verificado

1. **O CPF é matematicamente válido.** Rodei o mesmo algoritmo de dígitos verificadores usado pelo app (`isValidCpf` em `src/lib/regional.ts`) sobre `867.033.115-28` → resultado `true`. Ou seja, a validação local NÃO reprovou esse CPF.
2. **A reprovação veio do provedor externo.** Em `registry_lookup_audit` existem 3 tentativas recentes (03/08 19:34, 19:42) com `lookup_kind = cpf`, `identifier_suffix = 1528`, `provider = cpf-brasil`, `http_status = 404`, `error_code = invalid_or_not_found`. Uma consulta de outro CPF (sufixo 9879) no mesmo minuto retornou `200 / success` — então a credencial e o provedor estão funcionando; o 404 é específico desse documento.
3. **Onde nasce o rótulo errado.** Em `src/pages/contacts/ContactForm.tsx` o erro `invalid_or_not_found` é tratado como `status: 'invalid'`, que renderiza o rótulo vermelho "CPF inválido" (`cpfStatusLabel.invalid`) e o toast "CPF não encontrado ou inválido.". A Edge Function `registry-lookup` faz o mesmo mapeamento: `failureClass === "not_found"` → grava `cpf_verification_status = 'invalid'` em `contact_identity_profiles`.

## Conclusão

Não é um bug de cálculo de CPF. O CPF é válido; o que aconteceu é que a base do provedor `cpf-brasil` respondeu 404 (não encontrado) para esse documento, e o Seialz hoje trata "não encontrado na base do provedor" como "CPF inválido" — tanto na tela quanto no status persistido.

Consequências práticas: o usuário vê um erro que sugere erro de digitação (não é), e o contato fica marcado como `invalid` no perfil de identidade mesmo tendo um CPF formalmente correto.

## Correção proposta (quando você aprovar)

1. **Separar os dois casos** no frontend e na Edge Function:
   - dígitos verificadores reprovados → `invalid` ("CPF inválido"), erro claro de digitação;
   - provedor retornou 404 → novo estado tipo `not_found` ("CPF não encontrado na base consultada"), em tom neutro/aviso, sem marcar o documento como inválido.
2. **Não persistir `invalid`** em `contact_identity_profiles` quando a causa foi 404 do provedor — usar o novo status, preservando `verified` anterior como já é feito hoje.
3. **Permitir salvar normalmente** o contato com CPF válido não encontrado (hoje o salvamento em si já passa, pois usa `isValidCpf`; o ajuste é só de estado/rótulo para não confundir).
4. **Ajustar rótulos** em `cpfStatusLabel` / `cpfStatusLabelEn` e o texto do toast.

## Detalhes técnicos

- Arquivos envolvidos: `src/pages/contacts/ContactForm.tsx` (bloco `verifyCpf`, linhas ~288-300), `src/lib/regional.ts` (`CpfVerificationStatus` + labels), `supabase/functions/registry-lookup/index.ts` (mapeamento `failureClass` → `cpf_verification_status`, linhas ~210-241).
- Sem mudança de schema: `cpf_verification_status` é texto; se houver CHECK constraint no valor, é preciso confirmar antes de introduzir `not_found` (verificar na hora da implementação).
- Nenhuma alteração em regras de dedupe, Inbox, Messages ou multi-tenancy.
