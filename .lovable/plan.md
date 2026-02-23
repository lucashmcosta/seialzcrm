

# Fix: Separar hasAI (agente) de hasAIIntegration (melhoria de texto)

## Problema

A correcao anterior unificou tudo sob `hasAI` (que agora checa `ai_agents.is_enabled`). Isso fez os botoes de melhoria de texto (corrigir gramatica, tornar persuasivo, etc.) sumirem para orgs que tem a chave OpenAI configurada mas nao tem agente ativo.

As funcoes de melhoria de texto usam a edge function `ai-generate`, que depende da **integracao AI** (chave OpenAI/Claude em `organization_integrations`), NAO do agente.

## Correcao

Manter duas queries separadas:

| Query | Checa | Controla |
|-------|-------|----------|
| `hasAIAgent` | `ai_agents.is_enabled = true` | Botao "Devolver ao AI" |
| `hasAIIntegration` | `organization_integrations` com slug openai/claude | Botoes de melhoria de texto (corrigir, persuasivo, etc.) |

## Mudancas no MessagesList.tsx

1. Renomear a query atual `hasAI` para `hasAIAgent`
2. Adicionar nova query `hasAIIntegration` que restaura a logica anterior (checa `organization_integrations` com slugs de AI)
3. Atualizar condicional do botao "Devolver ao AI" (linha 1175): usar `hasAIAgent`
4. Atualizar condicional dos botoes de melhoria de texto (linha 1469): usar `hasAIIntegration`

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/messages/MessagesList.tsx` | Separar `hasAI` em duas queries: `hasAIAgent` e `hasAIIntegration` |

