# V2 — ignorar signatários sem campo antes de montar os participantes

## Problema confirmado no código
Em `prepare_contract` (signature-requests), a lista `nonCreator` e a escolha de quem recebe o contato são feitas sobre **todos** os `def.signatories`. Um ref sem campo (`client` no Contrato Unificado 2) ganha o contato pela regra `s.ref === "client"`. Aí `role-client`, que tem os campos, cai em "signatário manual" e gera `signers_required`, ou vira um participante extra.

## Correção (só no Seialz, só na montagem do envio V2)
1. Novo helper puro em `_shared/suvsign-v2.ts`: `signatoriesWithFields(def)`.
   - Monta o conjunto de refs a partir de `def.fields[].template_signatory_ref`.
   - Devolve somente os `def.signatories` cujo `ref` está nesse conjunto.
   - Não altera a definição original.
2. Em `prepare_contract`, trocar `signatories` por `signatoriesWithFields(def)` antes de calcular `nonCreator` e antes do laço de resolução. Todo o resto continua igual: contato, usuário/criador, manuais, `buildMultiDocument`, a deduplicação por identidade real, os refs p1…pN e o remapeamento dos campos.
3. Regra: **SIGNATÁRIO SEM CAMPO NÃO VIRA PARTICIPANTE DA OPERAÇÃO.**

Ponto de atenção [INCERTO]: se o texto do template usar variáveis de um ref descartado (ex.: `[client.FullName]`), o bloqueio de placeholders pendentes (422) continua valendo. Não vou inventar preenchimento para refs descartados. Se isso acontecer no Contrato Unificado 2, vou reportar.

## Testes (Deno, no helper e builder reais)
A combinação `signatoriesWithFields` + a regra de resolução vai para uma função testável `resolveTemplateSignatories(def, {contact, me, extras})`, extraída do laço atual sem mudar comportamento. O edge passa a chamá-la.
- **Caso A**, Contrato Unificado com role-client e Kaik: 1 documento, 2 participantes, cliente = p1, Kaik = p2, campos certos.
- **Caso B**, Procuração + Unificado: 2 documentos, 2 participantes, cliente único com campos nos dois documentos, Kaik só no Unificado.
- **Caso C**, Unificado 2 com `client` sem campo, `role-client` com campos e Kaik: `client` ignorado, 2 participantes, cliente resolvido pelo contato, nenhum `signers_required`.
- **Caso D**, um signatário sem campo e sem outro uso: não aparece em `participants[]`.
- Os 6 testes existentes continuam passando.

## Fora do escopo
SuvSign, V1 (`SendToSignatureButton`, create-from-template, payload V1), schema, templates, webhook, Nammux e operação real: nada muda. Depois disso, só o deploy de `signature-requests`.

## Entrega
Arquivos alterados, a regra, PASS/FAIL dos casos A–D, participantes finais do Unificado 2, confirmação de que o V1 está intacto e build/typecheck.
