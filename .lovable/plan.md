# V2 — usar automaticamente os signatários fixos da definição SuvSign

## Situação atual
`resolveTemplateSignatories` (em `_shared/suvsign-v2.ts`) usa três caminhos: criador, cliente (`ref === "client"`, o único não-criador ou o primeiro não-criador) e manual (`extras`). O Kaik só é resolvido pelo caminho manual. Por isso ele cai em `unresolved` e a tela pede nome e e-mail.

## Correção (somente no helper, com prioridade explícita)
Para cada signatário com campo (o filtro `signatoriesWithFields` continua igual):
1. **Fixo**: `identity_source === "template"`, com `name` preenchido e `email` válido. Usa os dados da definição e a identidade `manual:<email em minúsculas>`. Não pede nada ao usuário.
2. **Criador** (`is_creator`): usuário logado, `user:<id>`.
3. **Cliente**: contato do CRM, `contact:<id>`. Os candidatos a "primeiro/único não-criador" passam a excluir os signatários fixos, para que o Kaik nunca receba o contato e não impeça o `role-client` de receber.
4. **Consumer restante**: `extras` manual, como hoje. Se não houver dados, vai para `unresolved` e a tela mostra o formulário.

Compatibilidade: definições sem `identity_source` seguem exatamente o comportamento atual. Se o fixo vier sem nome ou com e-mail inválido, ele cai nos passos seguintes, sem erro novo. Nada é fixado no código: nem Kaik, nem e-mail, nem regra da Central. A definição recebida não é alterada.

A tela já monta a lista de signatários a partir do resultado do preparo. Com o Kaik resolvido, o formulário dele deixa de aparecer, sem mudança na tela. Vou confirmar isso lendo `SignatureV2Sheet` antes de fechar e só mexo nela se ela exibir o formulário por conta própria.

## Testes (Deno, helper e builder reais)
- A: Unificado (role-client consumer + Kaik template). 2 participantes, nenhum `unresolved` e `extras` vazio.
- B: Procuração + Unificado. 2 documentos, 2 participantes, cliente único.
- C: Unificado 2. `client` sem campo ignorado, role-client = contato, Kaik = fixo, 2 participantes.
- D: consumer desconhecido sem extras vai para `unresolved`. Com extras, é resolvido como manual.
- E: definição antiga sem `identity_source`, com o mesmo resultado de hoje.
- Os 10 testes que já existem são ajustados só onde passam `extras` do Kaik e continuam passando.

## Publicação
Build/testes, depois o deploy apenas de `signature-requests`. Sem operação real.

## Não muda
V1, botão V1, SuvSign, schema, webhook, Nammux, templates, flags, renderer e snapshots/operações existentes.
