

## Fix: Export de conversas retornando sem mensagens

### Problema identificado
A edge function `export-conversations` faz `.select('content, sender_type, sender_name, created_at, message_type')` mas a coluna `message_type` **não existe** na tabela `messages`. O Supabase retorna erro silencioso e os dados vêm vazios.

### Solução
Remover `message_type` do select na edge function. Verificar também se existem outras colunas que possam ser usadas (como `type` ou `media_type`).

### Arquivo a editar
| Arquivo | Mudança |
|---------|---------|
| `supabase/functions/export-conversations/index.ts` | Remover `message_type` do select, usar coluna correta se existir |

### Detalhes técnicos
- Confirmar colunas reais da tabela `messages` e ajustar o select
- Redesploar a edge function automaticamente

