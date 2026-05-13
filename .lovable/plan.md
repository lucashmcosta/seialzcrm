## Objetivo

Quando uma oportunidade estiver com status `won` (Ganho) ou `lost` (Perdido), a tela de detalhe (`/opportunities/:id`) deve bloquear toda edição **exceto o nome (título)** da oportunidade.

## Escopo

Arquivos afetados:
- `src/pages/opportunities/OpportunityDetail.tsx`
- `src/components/opportunities/OpportunityDialog.tsx`

## Comportamento

Definir `isClosed = opportunity.status === 'won' || opportunity.status === 'lost'`.

### Na página de detalhe (`OpportunityDetail.tsx`)

Quando `isClosed === true`:
- **Botão "Editar"**: continua visível e abre o `OpportunityDialog`, mas em modo restrito (só edita o título).
- **Botões "Marcar Ganho" / "Marcar Perdido"**: já só aparecem em `status === 'open'`, mantém.
- **`OwnerSelector`** (Responsável): renderizar como texto somente-leitura (nome do owner atual) em vez do seletor.
- **`TagSelector`**: ocultar ou renderizar em modo somente-leitura (mostrar tags atuais sem permitir adicionar/remover).
- Demais campos da aba Visão Geral já são apenas display — sem mudança.
- Abas de Atividade, Chamadas, Mensagens, Tarefas, Anexos e Notas continuam funcionando normalmente (são interações com o contato, não edição da oportunidade).

### No diálogo de edição (`OpportunityDialog.tsx`)

Adicionar prop `titleOnly?: boolean`. Quando `true`:
- Manter apenas o campo "Título" editável.
- Desabilitar (`disabled`) ou ocultar: contato, valor, moeda, etapa, data de fechamento, status, responsável e demais campos.
- O `submit` envia somente `{ title, updated_by }` no `update`.

A página passa `titleOnly={isClosed}` ao abrir o dialog.

## Notas técnicas

- Não alterar RLS nem regras no backend; é trava puramente de UI/UX (já existem `permissions.canEditOpportunities` para gating geral).
- Usar tokens semânticos do design system; nenhuma cor direta.
- Não introduzir botão "Reabrir oportunidade" (fora do escopo pedido).
