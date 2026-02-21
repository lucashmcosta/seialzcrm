

# Fix: Botao "Devolver ao AI" aparecendo em orgs sem agente ativo

## Problema

A query `hasAI` no `MessagesList.tsx` (linhas 269-284) verifica apenas se a org tem uma **integracao AI configurada** (chave OpenAI/Claude em `organization_integrations`). Ela **nao** verifica se existe um `ai_agents` com `is_enabled = true`.

O webhook usa a checagem correta: `ai_agents.is_enabled = true`. Entao uma org pode ter a chave da OpenAI configurada mas o agente desativado, e o botao "Devolver ao AI" aparece incorretamente.

## Correcao

Atualizar a query `hasAI` para tambem verificar se existe um agente ativo na tabela `ai_agents`:

```typescript
const { data: hasAI } = useQuery({
  queryKey: ['org-has-ai', organization?.id],
  queryFn: async () => {
    if (!organization?.id) return false;

    // Check if org has an active AI agent (same logic as webhook)
    const { data: agents } = await supabase
      .from('ai_agents')
      .select('id')
      .eq('organization_id', organization.id)
      .eq('is_enabled', true)
      .limit(1);

    return agents && agents.length > 0;
  },
  enabled: !!organization?.id,
});
```

Isso alinha a logica do frontend com a do webhook: o botao so aparece se a org realmente tem um agente AI ativo e habilitado.

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/messages/MessagesList.tsx` | Substituir query `hasAI` (linhas 269-284) para checar `ai_agents.is_enabled` ao inves de `organization_integrations` |

## Impacto

- Botao "Devolver ao AI" so aparece quando a org tem agente ativo
- Botao "Melhorar com AI" no campo de texto tambem usa `hasAI`, entao ficara consistente
- Nenhuma outra mudanca necessaria, o condicional na linha 1174 ja esta correto (`selectedThread.needs_human_attention && hasAI`)

