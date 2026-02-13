
# Melhorias no Modulo de Mensagens

## Resumo

Tres melhorias: painel redimensionavel, lista simplificada e filtros "Nao lidas" / "Nao respondidas", com os 3 ajustes solicitados pelo usuario.

---

## 1. Migration SQL

Criar tabela `message_thread_reads` para suportar multiplos atendentes e adicionar campo `last_inbound_at` na `message_threads`:

```sql
-- Tabela separada para tracking de leitura por usuario
CREATE TABLE message_thread_reads (
  thread_id uuid NOT NULL REFERENCES message_threads(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

ALTER TABLE message_thread_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own thread reads"
  ON message_thread_reads FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Users can upsert own thread reads"
  ON message_thread_reads FOR INSERT
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can update own thread reads"
  ON message_thread_reads FOR UPDATE
  USING (user_id = auth.uid());

-- Campo last_inbound_at na message_threads para comparacao precisa
ALTER TABLE message_threads
  ADD COLUMN last_inbound_at timestamptz DEFAULT NULL;

-- Preencher last_inbound_at com dados existentes (copiar de whatsapp_last_inbound_at onde disponivel)
UPDATE message_threads
  SET last_inbound_at = whatsapp_last_inbound_at
  WHERE whatsapp_last_inbound_at IS NOT NULL;
```

---

## 2. Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/messages/MessagesList.tsx` | Layout redimensionavel, remover preview, adicionar filtros, upsert `last_read_at` ao selecionar thread, carregar `last_inbound_at` e `last_read_at` na query |

Nenhum arquivo novo sera criado.

---

## 3. Ordem de implementacao

### Passo 1: Migration SQL
- Criar tabela `message_thread_reads` com PK composta `(thread_id, user_id)`
- Adicionar coluna `last_inbound_at` na `message_threads`
- Preencher `last_inbound_at` com dados existentes
- RLS: usuario so le/escreve seus proprios registros

### Passo 2: Atualizar query de threads para incluir `last_inbound_at` e `last_read_at`
- No select da query de threads (linha 283), adicionar `last_inbound_at`
- Apos o select principal, buscar os registros de `message_thread_reads` para o usuario atual (um unico select com `WHERE user_id = userProfile.id AND thread_id IN (...)`)
- Fazer merge: cada thread recebe `last_read_at` do registro correspondente (ou null)
- Calcular `unread`: `last_message_direction === 'inbound' && (last_read_at === null || last_inbound_at > last_read_at)`
- Atualizar interface `ChatThread` com `last_inbound_at` e `last_read_at`

### Passo 3: Upsert `last_read_at` ao abrir conversa
- Na funcao `fetchMessages` (linha 456), apos carregar mensagens, fazer upsert:
  ```typescript
  await supabase
    .from('message_thread_reads')
    .upsert({
      thread_id: threadId,
      user_id: userProfile?.id,
      last_read_at: new Date().toISOString()
    }, { onConflict: 'thread_id,user_id' });
  ```
- Atualizar o estado local da thread para refletir como lida

### Passo 4: Layout redimensionavel
- Importar `ResizablePanelGroup`, `ResizablePanel`, `ResizableHandle` de `@/components/ui/resizable`
- Substituir `<div className="flex h-[calc(100vh-2rem)] overflow-hidden">` (linha 787) por `<ResizablePanelGroup direction="horizontal" className="h-[calc(100vh-2rem)]">`
- Painel esquerdo: `<ResizablePanel defaultSize={25} minSize={15} maxSize={40}>` no lugar de `<div className="w-80 ...">` (linha 789)
- Adicionar `<ResizableHandle withHandle />` entre os paineis
- Painel direito: `<ResizablePanel defaultSize={75}>` no lugar de `<div className="flex-1 ...">` (linha 861)
- Remover classes `w-80` e `flex-1`

### Passo 5: Simplificar itens da lista
- No `ChatListItem`, remover o bloco de preview (linhas 177-186) que mostra a ultima mensagem
- Manter: Avatar + Nome + dot de nao lida + timestamp

### Passo 6: Filtros
- Adicionar estado `const [filter, setFilter] = useState<'all' | 'unread' | 'unanswered'>('all')`
- Renderizar 3 chips abaixo da barra de busca: "Todas", "Nao lidas", "Nao respondidas"
- Atualizar `filteredThreads` para combinar busca + filtro:
  - `unread`: `thread.last_message_direction === 'inbound' && (!thread.last_read_at || new Date(thread.last_inbound_at) > new Date(thread.last_read_at))`
  - `unanswered`: `thread.last_message_direction === 'inbound'`

### Passo 7: Atualizar `last_inbound_at` via Realtime
- Quando uma nova mensagem inbound chega via Realtime e pertence a uma thread no estado, atualizar `last_inbound_at` localmente para que o dot de "nao lida" apareca imediatamente

---

## 4. Pontos de atencao

- **Multi-tenant / multi-atendente**: A tabela `message_thread_reads` com PK `(thread_id, user_id)` garante que cada atendente tem seu proprio tracking de leitura independente. RLS garante isolamento.
- **`last_inbound_at` vs `updated_at`**: Conforme solicitado, a comparacao de "nao lida" usa `last_inbound_at` (timestamp da ultima mensagem inbound), nao `updated_at` da thread.
- **`needs_human_attention` vs `unread`**: Continuam como conceitos separados. `needs_human_attention` = agente IA escalou. `unread` = usuario nao viu a mensagem.
- **Performance**: O upsert no `message_thread_reads` e operacao leve por PK. A busca dos reads e um unico SELECT com IN clause.
- **Resizable panels**: O pacote `react-resizable-panels` e o componente `@/components/ui/resizable` ja existem no projeto.
