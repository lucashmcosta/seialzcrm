## Problema

No formulário "Novo contato", números brasileiros com **DDD 55** (Rio Grande do Sul, ex: `(55) 99999-9999`) não funcionam corretamente.

## Causa

Em `src/lib/phoneUtils.ts`, o código do país do Brasil (`55`) colide com o DDD `55`. A lógica atual sempre remove o prefixo `55` quando encontrado, mesmo quando ele é parte do DDD:

- **`buildE164`** (linha ~165): `if (cleaned.startsWith(country.dialCode)) return '+' + cleaned;`
  → Usuário digita `55999999999` (DDD 55 + celular). O código vê "começa com 55" e retorna `+55999999999` (faltando o country code real).

- **`formatPhoneForCountry`** (linha ~55): remove os primeiros `55` antes de formatar, então o DDD some da máscara.

- **`detectCountryFromE164`**: também pode classificar errado em casos similares.

## Solução

Tornar a remoção/detecção do código de país **sensível ao comprimento**, não apenas ao prefixo:

1. **`buildE164`** (BR): só considerar que o `55` inicial é country code se o número limpo tiver 12 ou 13 dígitos (55 + DDD 2 dígitos + 8/9 dígitos). Para 10 ou 11 dígitos, tratar como número local (DDD + assinante) e sempre prefixar `+55`.

2. **`formatPhoneForCountry`** (BR): mesma regra — só remover `55` inicial quando o restante tiver 10 ou 11 dígitos (formato local válido). Caso contrário, manter os dígitos para formatar como DDD+número.

3. **`detectCountryFromE164`**: para entradas começando com `55`, só classificar como BR quando o comprimento for compatível com E.164 BR (12–13 dígitos). Caso contrário, manter o default sem stripar.

## Arquivos alterados

- `src/lib/phoneUtils.ts` (apenas as 3 funções acima)

## Fora do escopo

- Nenhuma mudança em backend, edge functions, validação server-side, ou outros países.
- Sem alterações no `PhoneInput.tsx` (a correção em `phoneUtils` propaga).

## Validação manual

- Digitar `55999999999` → resultado E.164 esperado: `+5555999999999`, exibição: `(55) 99999-9999`.
- Digitar `5598765432` (fixo DDD 55) → `+555598765432`, exibição `(55) 9876-5432`.
- Regressão: `11964298621` continua virando `+5511964298621` e `(11) 96429-8621`.
- Regressão: número já E.164 `+5511964298621` continua sendo detectado como BR e formatado corretamente.
