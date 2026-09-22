# Adicionar França ao seletor de país do telefone

Mesmo comportamento já aplicado no app mobile, aplicado no web.

## O que muda

- Nova opção na lista de países: França (+33), bandeira 🇫🇷, exemplo `6 12 34 56 78`.
- Exibição de números franceses com 9 dígitos no formato `X XX XX XX XX`.
- Regra do zero de tronco: se a pessoa digitar do jeito natural (`06 12 34 56 78`), o zero inicial é descartado antes de montar o número internacional. Assim `612345678`, `0612345678` e `33612345678` resultam todos em `+33612345678`.
- Números salvos começando com `+33` passam a ser reconhecidos como França.

Nada muda para os países já existentes.

## Detalhe técnico

Arquivo: `src/lib/phoneUtils.ts`

1. `COUNTRIES`: incluir `{ code: 'FR', name: 'França', dialCode: '33', flag: '🇫🇷', placeholder: '6 12 34 56 78' }`.
2. `formatPhoneForCountry`: no ramo `case 'FR'`, remover um `0` inicial quando houver 10 dígitos e formatar 9 dígitos como `X XX XX XX XX`.
3. `buildE164`: para `FR`, normalizar antes de prefixar — remover `0` inicial em entradas de 10 dígitos; tratar `33` inicial como código de país apenas quando o total tiver 11 dígitos (`33` + 9), para não confundir com um DDD brasileiro `33` (ex.: `3312345678`, 10 dígitos), seguindo o mesmo padrão de guarda já usado para o BR.
4. `detectCountryFromE164`: a ordenação por tamanho do `dialCode` (decrescente) já avalia `351` antes de `33` — confirmado, nenhuma alteração necessária. Aplicar a mesma guarda de comprimento do item 3 para `33`.

O `CountryPhoneInput` (e telas de contato) usa `COUNTRIES` dinamicamente, então a opção aparece sem mudanças de UI. Antes de editar, o componente de entrada de telefone será lido para confirmar que não há lista de países duplicada.
