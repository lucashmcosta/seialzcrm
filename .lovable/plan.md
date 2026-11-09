# Cliente de teste "Cliente Teste App" — Central Trabalhista

Nada foi criado nem alterado ainda. Antes de executar, preciso da sua decisão nos 3 pontos de bloqueio abaixo.

## Bloqueios (decisão sua)

1. **O telefone já está em uso.** +55 11 96429-8621 já pertence ao contato **"Joao Teste"** (c90e9e78…, CPF diferente, já cliente, 9 oportunidades). A prevenção de duplicados pode juntar o novo contato com o Joao Teste, e no Nammux/App o login pode cair no contato errado. Opções:
   - a) criar o contato novo sem telefone (se a regra permitir — veja o item 2);
   - b) usar outro número real seu;
   - c) usar o próprio Joao Teste em vez de criar um novo.
2. **O "Ganho" da Central está bloqueado por requisitos** (modo "exigir"). Pelo caminho normal, a oportunidade só fecha com tudo isto:
   - telefone preenchido (então a opção 1a não funciona);
   - CPF **verificado** pela consulta de cadastro — um CPF fictício pode voltar como inválido ou não encontrado e travar o fechamento;
   - endereço completo;
   - documentos: CTPS, comprovante de residência e um documento de identidade (RG, RNE ou CNH) — preciso de arquivos fictícios;
   - classificação do processo feita.
   Quer que eu siga esses passos com dados fictícios (endereço, arquivos de exemplo, classificação), ou fechar como Ganho usando a liberação interna que já existe? A liberação pula a checagem, então o caminho não fica igual ao de um cliente real.
3. **O CPF 207.492.652-99** passa no cálculo do dígito, mas não sei se a consulta de cadastro aceita. Se der "não encontrado", o item 2 trava.

## O que dispara quando vira Ganho (lido no banco)

| Automação | Efeito | Fica no Seialz? | Como evitar |
|---|---|---|---|
| Aviso "Oportunidade ganha" | notificação para o responsável | sim | sem problema |
| Contato vira "cliente" | muda a etapa do contato | sim | é o esperado |
| Fotografia do fechamento, histórico de etapas, registro de auditoria | registros internos | sim | sem problema |
| **Evento de compra para a Meta (anúncios)** | envia "Purchase" para a Meta, ligado na Central (214 eventos em 30 dias) | **não** | não dá para desligar só para um contato sem mexer na automação. O contato de teste não tem origem em anúncio, então a Meta deve ignorar, mas o envio acontece |
| **Integração Nammux (opportunity.won)** | cria o cliente e o processo no Nammux | **não** (é o objetivo) | mantido |
| Documentos pós-ganho para o Nammux | envia os documentos do item 2 | não (Nammux) | é o esperado |
| Webhooks de teste (webhook.site) | — | — | já estão desligados |

Não encontrei mensagem automática de WhatsApp ou e-mail para o contato, cobrança, nem contrato ou assinatura que disparem no Ganho. A assinatura (SuvSign) só sai quando alguém envia pela tela. **[INCERTO]** Não sei se o Nammux manda mensagem ao cliente depois de criar o processo; isso tem que ser conferido do lado do Nammux.

## Marcar como teste

Os contatos não têm um campo "teste" ou "excluir de relatórios". Sem criar um campo novo (o que mudaria a estrutura), o contato entra em relatórios, funil e métricas. Sugestão: usar o nome "Cliente Teste App" e excluir depois.

## Execução (depois da sua autorização)

1. Criar o contato na Central (nome, CPF e telefone conforme a sua decisão).
2. Criar a oportunidade no funil da Central, na etapa "Novo", sem responsável, para não entrar no rodízio da equipe. **[INCERTO]** O rodízio pode atribuir alguém automaticamente.
3. Cumprir os requisitos de fechamento conforme a sua decisão no item 2.
4. Mover para "Ganho" pelo mesmo caminho da tela.
5. Conferir o evento enviado ao Nammux e a resposta, e trazer os IDs do cliente e do processo lá, se a resposta trouxer.

Não haverá alteração de código, automações, funis ou outros contatos, e nada para publicar: são só dados.
