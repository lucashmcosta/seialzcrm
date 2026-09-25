# Modal SuvSign V2 — reproduzir a Proposta A do HTML, tela por tela

Renderizei o HTML e comparei as 7 telas com o modal atual. Até aqui só a divisão em duas colunas estava igual. Esta rodada reproduz a composição completa. Muda somente o `SignatureV2Sheet.tsx`, sem backend, SuvSign, V1, flags ou schema.

## Estrutura comum (todas as telas)
- Sem subtítulo no cabeçalho. O HTML não tem.
- Cabeçalho da lista: "Assinatura de contrato" à esquerda. À direita ficam o **"+ Novo envio" (verde, compacto)** e o X.
- Cabeçalho das etapas: "Novo envio" à esquerda e o **stepper 1 Documentos — 2 Dados e signatários — 3 Revisar e enviar** no centro, com ✓ nas etapas concluídas, e o X.
- Largura de ~1100px e altura fixa. O rodapé das etapas fica fixo, com a ação secundária à esquerda e a principal à direita.
- Cores só com tokens do tema (primary para o verde; warning, destructive e info para os status).

## Lista + detalhe (A, Rascunho, A4, A5)
- **Coluna esquerda de 360px**, com o título "Solicitações" pequeno, em negrito e cinza.
- **Item:**
  - título em negrito, com até 2 linhas;
  - status em pílula com bolinha à direita (Enviado azul, Rascunho cinza, Em andamento âmbar, Concluído verde, Cancelado cinza vazado);
  - "Participante (+N) · N documentos";
  - data.
  - Quando selecionado, fundo verde bem claro e borda fina.
- **Painel direito:**
  - pílula de status;
  - título grande com o nome dos documentos;
  - linha de data ("Enviado em…", "Concluído em…", ou "Criado em … · ainda não enviado");
  - seção **Participantes** em linhas com divisória. Nome e e-mail ficam à esquerda, e o status fica numa coluna do meio: "✓ Assinou em …" em verde ou "Aguardando assinatura" em âmbar;
  - seção **Documentos** em linhas: ícone (✓ quando concluído), nome, status do documento no meio e "Baixar" em botão contornado à direita, só quando concluído;
  - ações no fim do painel: **"Atualizar"** em botão contornado e **"Cancelar solicitação"** como link vermelho.
- **Rascunho:** "Continuar preparação" (verde). "Descartar rascunho" continua fora, como aprovado antes.
- **Copiar link:** não entra, porque segue bloqueado pelo contrato da SuvSign.

## A1 · Escolher documentos
- Coluna central de ~620px com o título "Escolha os documentos" e a frase "Os documentos selecionados são enviados juntos, em um único link de assinatura."
- Uma linha por documento: checkbox, nome e descrição, se a API trouxer. Selecionado = fundo verde claro com borda verde. Incompatível = esmaecido, com o motivo no lugar da descrição.
- Rodapé: "N documentos selecionados" à esquerda, e "Cancelar" e "Continuar" à direita.

## A2 · Dados e signatários
- **Área principal:**
  - título e frase de conferência;
  - caixa âmbar de pendências com a lista e "Abrir contato";
  - "Dados preenchidos pelo CRM" em grade de 3 colunas (Nome, CPF, Telefone, E-mail, Endereço, Bairro, Cidade/UF, CEP).
- **Coluna direita de 340px:** "Signatários", com nome, e-mail e "Assina N documentos".
- **Rodapé:** "Voltar" à esquerda. À direita, o aviso âmbar "Corrija as pendências no CRM para enviar" (quando houver) e "Continuar".

## A3 · Revisar e enviar
- Coluna esquerda de 240px com "Documentos". O item ativo fica em caixa branca com borda. No pé da coluna vai "Signatário" com nome e e-mail.
- À direita, um fundo cinza com a folha branca centralizada, com a prévia atual.
- Rodapé: "Voltar" e "Enviar N documentos para assinatura".

## Mobile
- Na lista, só as solicitações aparecem. Um toque abre o detalhe em tela cheia com "Voltar".
- Nas etapas, as colunas laterais descem para baixo do conteúdo e o stepper mostra só os números.

## Validação
- Reproduzo as mesmas 7 telas do HTML com dados simulados (lista em andamento, rascunho, A1, A2 com pendência, A3, enviado, concluído) na mesma largura de 1280.
- Coloco cada print lado a lado com o do HTML e aponto qualquer diferença que sobrar.
- Mobile: lista e detalhe.
- Não declaro PASS com a sua conta real, porque o preview de teste não permite login. Isso fica para você conferir.

Resultado esperado: `PROPOSTA A — LAYOUT DO HTML REPRODUZIDO TELA A TELA`
