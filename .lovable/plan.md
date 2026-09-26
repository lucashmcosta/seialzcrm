# V2 — resolver `Custom.DataFechamento` (paridade com V1)

## O que já foi confirmado no código (só leitura)
- O campo da oportunidade é `opportunities.close_date`, do tipo data.
- **V1** (`SendToSignatureButton.tsx`, linhas 123-130) manda `custom.deal_close_date` no formato `toLocaleDateString('pt-BR', { day:'numeric', month:'long', year:'numeric' })`. Com 2026-05-07, isso vira **"7 de maio de 2026"**. O V1 nunca manda `DataFechamento`. Quem traduz `deal_close_date` para `DataFechamento` é o mapeamento do conector configurado dentro da SuvSign (V1 `applyFieldMapping`), e o Seialz não tem acesso a esse mapeamento. Isso já está anotado como [INCERTO] na documentação da V2.
- **V2** (`signature-requests/index.ts`, linha 202) já calcula `custom.deal_close_date` com a mesma fórmula. Mas `applyVariables` só troca `[Custom.<chave>]` quando a chave existe em `custom`. Como `DataFechamento` não existe, o marcador fica sem valor e o bloqueio de pendências acusa.
- **Causa provável: A, alias inexistente.** É o mesmo tipo de problema que aconteceu com Endereco, Bairro, Cidade, Estado e CEP. A data em si e o namespace `Custom` funcionam.

## Etapa 1 — confirmar (só leitura)
1. Ler o `close_date` bruto da oportunidade do teste pelas ferramentas de banco. Esperado: `2026-05-07`.
2. Levantar os marcadores usados nos 3 templates compatíveis (Procuração, Contrato Unificado e Contrato Unificado 2) a partir dos `frozen_content` já gravados em `signature_requests` da Central e dos erros `unresolved_template_variables` recentes. Se algum template não tiver snapshot salvo, ele fica marcado como "não inspecionado" [INCERTO]. Não chamo a SuvSign por fora.
3. Classificar cada marcador em uma de cinco categorias: já resolvido pelo V2 / o V1 tem o dado, mas falta alias no V2 / sem fonte no CRM / resolvido pelo participante / desconhecido.
4. Se aparecerem outros aliases óbvios, eu **só listo no relatório** e não implemento nada além de `DataFechamento`.

## Etapa 2 — correção (só se a Etapa 1 confirmar)
- Em `signature-requests`, logo após a linha 202: `custom.DataFechamento = custom.deal_close_date`. É a mesma fonte e o mesmo formato do V1, e a chave antiga continua existindo.
- É um alias pelo significado do campo, sem condição por organização ou template.
- Não mexo em V1, SuvSign, template, schema, webhook, flags nem na oportunidade.

## Etapa 3 — testes
- Novo teste Deno: `applyVariables("[Custom.DataFechamento]")` com `custom` montado a partir de `2026-05-07` deve dar "7 de maio de 2026" e nenhuma pendência em `findUnresolvedPlaceholders`.
- Rodar os 16 testes que já existem, incluindo role-client como contato, Kaik automático, `client` sem campo ignorado e 2 participantes.
- Publicar somente `signature-requests`. Nenhuma operação real será criada.

## Entrega
Relatório nos 16 itens pedidos. O item 10 (preparo real do Contrato Unificado 2) fica marcado como "a validar por você na tela", porque não consigo entrar como usuário da Central.
