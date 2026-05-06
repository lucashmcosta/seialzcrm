## Objetivo

Permitir marcar uma oportunidade como **Ganho** (e Perdido) diretamente do header da conversa em `/messages`, sem precisar abrir a tela da oportunidade.

## Comportamento

1. Quando uma conversa é selecionada, buscar a(s) oportunidade(s) **abertas** (`status = 'open'`) do `contact_id` daquela thread.
2. Mostrar um botão verde **"Marcar como Ganho"** no header da conversa (ao lado de "Resolver"), com ícone `TrendUp`. Junto, um menu/secundário **"Marcar como Perdido"** (ícone `TrendDown`) para manter paridade.
3. Regras de exibição:
   - Se o contato tem **1 oportunidade aberta** → clicar no botão abre um `ConfirmDialog` ("Marcar oportunidade *Título* como ganha?") e executa a ação.
   - Se tem **2+ oportunidades abertas** → o botão abre um pequeno popover/select listando as oportunidades; ao escolher uma, confirma e marca.
   - Se tem **0 oportunidades abertas** → não exibir o botão (mantém a UI limpa).
4. Após sucesso: toast de confirmação, refetch da lista de oportunidades do contato e (opcional) sugerir resolver a conversa.

## Implementação técnica

**Arquivo:** `src/pages/messages/MessagesList.tsx`

- Novo estado: `contactOpportunities: Array<{id, title, status, pipeline_stage_id}>` e `wonDialogOpen`, `lostDialogOpen`, `selectedOppId`.
- Novo `useEffect` disparado por `selectedThread?.contact_id` que faz:
  ```ts
  supabase.from('opportunities')
    .select('id, title, status, pipeline_stage_id')
    .eq('contact_id', selectedThread.contact_id)
    .eq('organization_id', orgId)
    .eq('status', 'open')
    .is('deleted_at', null)
  ```
- Buscar `pipeline_stages` (uma vez, cacheado) para localizar o stage com `type = 'won'` / `type = 'lost'` — mesma lógica já usada em `OpportunityDetail.tsx` (linhas 148-194), que será replicada aqui em duas funções: `handleMarkOppWon(oppId)` e `handleMarkOppLost(oppId)`.
- Update na tabela `opportunities` com `{ status, pipeline_stage_id, updated_by: userProfile.id }`.
- Botões adicionados no bloco de ações do header (entre "Resolver" e "Devolver ao AI", linhas ~1252-1264):
  - Botão "Marcar como Ganho" — `variant="outline"` com classe verde (`text-green-600 border-green-600/30 hover:bg-green-50`).
  - Botão "Marcar como Perdido" — `variant="outline"` discreto.
- Reusar `ConfirmDialog` de `src/components/ui/confirm-dialog.tsx` para a confirmação.
- Caso múltiplas oportunidades: usar um `DropdownMenu` simples com a lista para escolher qual marcar.

## Fora do escopo

- Não alterar a tela `OpportunityDetail` (já tem essa ação).
- Não criar nova oportunidade automaticamente quando não houver — apenas oculta os botões.
- Não automatizar resolver a conversa após ganhar (pode ser uma melhoria futura).

## Arquivos modificados

- `src/pages/messages/MessagesList.tsx` (único arquivo).
