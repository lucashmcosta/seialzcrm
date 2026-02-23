

# Adicionar Australia ao seletor de paises do PhoneInput

## Mudanca

Adicionar a Australia na lista de paises em `src/lib/phoneUtils.ts`, com os seguintes dados:

- Codigo: `AU`
- Nome: `Australia`
- Codigo discagem: `61`
- Bandeira: Australia flag emoji
- Placeholder: `412 345 678`

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/lib/phoneUtils.ts` | Adicionar entrada da Australia no array `COUNTRIES` |
| `src/lib/phoneUtils.ts` | Adicionar case `AU` na funcao `formatPhoneForCountry` para formatar numeros australianos (9 digitos: XXX XXX XXX) |

O componente `PhoneInput` ja usa o array `COUNTRIES` dinamicamente, entao nao precisa de mudanca adicional.

