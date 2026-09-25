# A1 — remover o identificador técnico abaixo do nome do documento

Muda só a apresentação em `SignatureV2Sheet.tsx`, na linha 333 (segunda linha de cada item em "Escolha os documentos").

## Causa
A segunda linha mostra o campo `description` que vem da listagem de modelos da SuvSign. No modelo QA, esse campo traz um código interno (`qa-legacy-copy-of:<uuid>`).

## Correção
- A segunda linha só mostra a descrição quando ela for texto amigável.
- A descrição é escondida quando contém um UUID ou tem cara de código, ou seja, é uma palavra sem espaços com `:` ou `-`, como `qa-legacy-copy-of:…`.
- Nesse caso, o item mostra só o nome, por exemplo "QA-LEGACY Procuração". Se a API trouxer o número de páginas, ele continua aparecendo como antes.
- O motivo de incompatibilidade, o id usado na seleção, o que é enviado ao servidor, a seleção múltipla e a regra de compatibilidade V2 não mudam.

## Validação
- Build e verificação de tipos.
- Print do A1 com dados simulados (um item com o código técnico e um com descrição amigável), sem envio real.

Resultado esperado: `MODAL SUVSIGN V2 — IMPLEMENTAÇÃO VISUAL APROVADA E FINALIZADA`
