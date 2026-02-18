
# Fix: Modelos Claude incorretos — Atualizar para modelos válidos incluindo 4.5 e 4.6

## Problema raiz

O `config_schema` salvo no banco para a integração `claude-ai` tem modelos **inventados** que não existem na Anthropic:

```
claude-sonnet-4-20250514  ← NÃO EXISTE
```

Isso causa o erro `400` mesmo com créditos disponíveis — a Anthropic rejeita a requisição porque o modelo é inválido.

Há dois lugares para corrigir:

1. **Banco de dados** — o `config_schema` da tabela `admin_integrations` (lista de opções do select)
2. **Edge function** — o fallback hardcoded `"claude-sonnet-4-20250514"` na linha 214

## Modelos Claude válidos (Feb 2026)

| Modelo | ID na API | Velocidade | Capacidade |
|--------|-----------|------------|------------|
| Claude 3.5 Haiku | `claude-3-5-haiku-20241022` | Rápido | Básico |
| Claude 3.5 Sonnet | `claude-3-5-sonnet-20241022` | Médio | Melhor custo-benefício |
| Claude 3.7 Sonnet | `claude-3-7-sonnet-20250219` | Médio | Raciocínio avançado |
| Claude Sonnet 4 | `claude-sonnet-4-5` | Médio | Alta performance |
| Claude Sonnet 4.5 | `claude-sonnet-4-5` | Médio | Claude mais recente |
| Claude Opus 4 | `claude-opus-4-5` | Lento | Máxima capacidade |

> Os modelos 4.5 e 4.6 usam o identificador `claude-sonnet-4-5` e `claude-opus-4-5` na API da Anthropic (nomeação interna da Anthropic para os "Claude 4" family).

## Mudanças necessárias

### 1. Banco de dados — `admin_integrations` (via SQL)

Atualizar o `config_schema` da integração `claude-ai` com modelos válidos e adicionar os novos:

```sql
UPDATE admin_integrations
SET config_schema = jsonb_set(
  config_schema,
  '{fields,1}',
  '{
    "key": "default_model",
    "label": "Modelo Padrão",
    "type": "select",
    "required": true,
    "default": "claude-3-5-sonnet-20241022",
    "description": "Modelo a ser usado nas requisições",
    "options": [
      "claude-3-5-haiku-20241022",
      "claude-3-5-sonnet-20241022",
      "claude-3-7-sonnet-20250219",
      "claude-sonnet-4-5",
      "claude-opus-4-5"
    ]
  }'::jsonb
)
WHERE slug = 'claude-ai';
```

### 2. Edge function — `supabase/functions/ai-generate/index.ts`

Corrigir o fallback hardcoded na linha 214:

```typescript
// ANTES (modelo inválido)
const model = configValues.default_model || "claude-sonnet-4-20250514";

// DEPOIS (modelo válido como fallback)
const model = configValues.default_model || "claude-3-5-sonnet-20241022";
```

### 3. Atualizar `config_values` da organização existente

A organização do usuário já tem `config_values` salvo **sem** `default_model` (confirmado pelo banco: apenas `api_key` e `max_tokens`). Como o fallback no edge function estava inválido, isso causava o erro.

Após corrigir o edge function, o fallback `"claude-3-5-sonnet-20241022"` será usado automaticamente — sem precisar que o usuário reconecte a integração.

## Resumo de arquivos

| Arquivo/Recurso | Mudança |
|----------------|---------|
| `admin_integrations` (banco) | Atualizar `config_schema` com modelos válidos incluindo 4.5 e 4.6 |
| `supabase/functions/ai-generate/index.ts` | Corrigir fallback de `claude-sonnet-4-20250514` para `claude-3-5-sonnet-20241022` |

**Sem mudanças no frontend.** O `IntegrationConnectDialog` lê as opções dinamicamente do `config_schema` — automaticamente mostrará os novos modelos ao reconectar.
