## Problema

O bloco "Histórico de atribuição" no detalhe do atendimento mostra dados crus do banco:
- `TAKE_OVER`, `MANUAL_ASSIGNMENT` (action_type em maiúsculas)
- IDs truncados como `f306fa3c` em vez do nome do usuário
- Códigos de motivo como `"inbox_reassign_to_self"` entre aspas

Nenhum usuário final entende isso.

## Solução (somente UI)

Reescrever `src/components/inbox/InboxAssignmentHistory.tsx` para exibir frases em português natural, resolvendo IDs para nomes e mapeando códigos para rótulos legíveis.

### 1. Resolver nomes dos usuários

No `useInboxThread` (ou diretamente no componente via query separada), buscar `users.id, full_name` de todos os `from_user_id` / `to_user_id` / `performed_by_user_id` presentes no histórico, em uma única chamada `.in('id', [...])`. Montar um `Map<id, name>`.

Fallback quando o usuário não existir mais: "Usuário removido".

### 2. Mapear `action_type` para rótulos

```
MANUAL_ASSIGNMENT  → "Atribuição manual"
AUTO_ASSIGNMENT    → "Atribuição automática"
TAKE_OVER          → "Assumiu o atendimento"
RELEASE            → "Liberou o atendimento"
REASSIGN           → "Reatribuição"
UNASSIGN           → "Removeu atribuição"
```
(Manter fallback: title-case do código bruto se desconhecido.)

### 3. Mapear `reason` para frases

```
inbox_reassign_to_self   → "Reatribuiu para si"
inbox_manual_reassign    → "Reatribuição manual"
inbox_auto_round_robin   → "Distribuição automática"
inbox_release            → "Liberou da fila"
```
Fallback: esconder o bloco do reason se vier nulo; mostrar o texto cru entre aspas só se for frase livre (contém espaço).

### 4. Novo layout do item

Cada entrada vira uma frase única + timestamp discreto:

```
[ícone] Ketlyn Vieira assumiu o atendimento de João Silva
        03/06/2026, 10:22 · Reatribuiu para si
```

- Linha 1 (texto principal): nome do `performed_by` + ação + (quando aplicável) "de X para Y" usando nomes.
- Linha 2 (meta, `text-xs text-muted-foreground`): data formatada + " · " + motivo legível.
- Remover a exibição de IDs em `font-mono` e a label gritante em uppercase azul.
- Manter a borda lateral esquerda sutil já existente.

### 5. Regras de composição da frase

- `TAKE_OVER`: "{performed_by} assumiu o atendimento" (se houver `from_user_id` diferente: "… de {from_name}").
- `MANUAL_ASSIGNMENT` / `REASSIGN`: "{performed_by} atribuiu para {to_name}" (ou "de {from_name} para {to_name}" se ambos).
- `AUTO_ASSIGNMENT`: "Sistema atribuiu para {to_name}".
- `UNASSIGN` / `RELEASE`: "{performed_by} liberou o atendimento".
- Quando `performed_by` for o próprio `to_user_id`, usar "assumiu" em vez de "atribuiu para si".

## Arquivos afetados

- `src/components/inbox/InboxAssignmentHistory.tsx` — reescrita do render.
- `src/hooks/inbox/useInboxThread.ts` — adicionar fetch dos nomes dos usuários referenciados pelo histórico e expor `userNames: Map<string,string>` (ou aceitar um prop novo no componente e fazer a query lá com `useQuery`). Preferência: query local no componente para isolar.

## Fora de escopo

- Não muda schema, não muda a forma como os eventos são gravados.
- Não altera o restante do painel (Atendimento / Dados da conversa).