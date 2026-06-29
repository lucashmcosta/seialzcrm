## Problema real

Ao tentar abrir Nova Conversa para um contato que já tem thread resolvida em outro número, a UI pode continuar selecionando/exibindo a thread antiga (ex.: Joao Teste em 7491), em vez de abrir/criar a thread do endpoint escolhido (7020).

No banco já existe uma thread do Joao Teste no 7020:
- 7491: `a304367f...` — resolvida, criada hoje
- 7020: `5f77df99...` — aberta, criada em 27/06

Ou seja, para esse caso a ação correta é selecionar a thread do 7020, não a resolvida do 7491.

## Correção

### 1. `NewConversationDialog.tsx`
- Manter o seletor de número.
- Corrigir a ordem dos endpoints para facilitar a escolha visual: priorizar o 7020/BR quando aplicável, em vez de deixar o 7491 como default por ser mais recente.
- Após buscar/criar a thread pelo endpoint escolhido, retornar também o `endpointId` selecionado para o componente pai.

### 2. `MessagesList.tsx`
- Alterar `onSelectContact` para receber `endpointId`.
- Ao selecionar a thread retornada:
  - limpar o filtro de endpoint se ele estiver escondendo a thread escolhida;
  - limpar/ajustar a busca se necessário para a lista renderizar a thread correta;
  - chamar `refetchThreads()` e só então manter `selectedThreadId` na thread retornada.
- Isso evita que a lista fique visualmente presa na conversa antiga/resolvida que já estava selecionada.

### 3. Falha defensiva no diálogo
- Quando o endpoint escolhido for 7020 e já existir thread do contato no 7020, abrir essa thread mesmo que haja thread mais recente/resolvida no 7491.
- Se não existir thread naquele endpoint, criar uma nova com `primary_endpoint_id` do endpoint escolhido.

## Validação

- Abrir Nova Conversa > buscar Joao Teste > escolher 7020.
- Resultado esperado: header e lista mostram badge `Novo · 7020`, não `7491`.
- Se já existe thread 7020, abre `5f77df99...`.
- Se não existir, cria uma nova no 7020.
