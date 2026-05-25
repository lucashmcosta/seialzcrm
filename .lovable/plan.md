## Problema

Após a correção do DDD 55, digitar `5` no input de telefone faz aparecer `555`, e cada nova tecla duplica `5`s. Apagar também não funciona porque o ciclo se repete.

## Causa

O `useEffect` em `src/components/ui/phone-input.tsx` re-sincroniza o `localValue` toda vez que `value` muda. Como `buildE164` agora sempre prefixa `+55` (correto para BR), e `formatPhoneForCountry` deixou de remover o `55` quando o comprimento é "intermediário" (durante digitação), forma-se um loop:

- Digito `5` → onChange emite `+555` → useEffect re-formata `+555` → input vira `555` → próximo render emite `+55555` → input vira `5555` → ...

## Plano

Editar **apenas dois arquivos**:

### 1. `src/components/ui/phone-input.tsx`
No `useEffect` que sincroniza com `value`, comparar os dígitos do `value` recebido com o E.164 que `buildE164(localValue, country)` produziria a partir do que o usuário já digitou. Se forem iguais, **não** reescrever `localValue` — assim a re-formatação só acontece quando `value` vem de fora (ex: carregar contato existente), não durante digitação.

### 2. `src/lib/phoneUtils.ts`
Em `formatPhoneForCountry` para BR, tornar a remoção do `55` inicial mais robusta:
- Strip quando `rest.length` for **10 ou 11** (número local válido) — como hoje.
- **Também** strip quando `cleaned.length >= 12` (já é E.164 BR completo).
- Não strip em comprimentos intermediários (ex: `555`) — esses não devem mais ocorrer com o fix do `useEffect`.

## Fora de escopo
- Sem mudanças em backend, edge functions, outros países, ou no `NameInput`.

## Validação manual
- Digitar `55` no input vazio → input mostra `55` (não `5555`).
- Continuar `5599998888` → `(55) 99998-8888`, E.164 = `+5555999988888`.
- Backspace remove um dígito por vez.
- Carregar contato com `+5511964298621` → exibe `(11) 96429-8621`.
- Digitar `11964298621` → `(11) 96429-8621`, E.164 = `+5511964298621`.
