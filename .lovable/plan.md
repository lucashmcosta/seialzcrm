
# Fix Completo e Definitivo: Claude Integration

## Diagnóstico Total (Root Cause Analysis)

Após ler todos os arquivos relevantes e consultar o banco de dados, aqui está o que está errado — tudo de uma vez:

### Problema 1 — Banco de dados nunca atualizado
O `admin_integrations.config_schema` para `claude-ai` ainda contém:
```
options: ["claude-sonnet-4-20250514", "claude-3-5-sonnet-20241022", "claude-3-5-haiku-20241022", "claude-3-opus-20240229"]
default: "claude-sonnet-4-20250514"
```
Isso é o que aparece no dropdown do usuário. Nenhuma das migrações anteriores foi executada.

### Problema 2 — `ai-agent-respond` tem fallback INVÁLIDO
`supabase/functions/ai-agent-respond/index.ts`, linha 1811:
```typescript
const model = configValues.default_model || 'claude-sonnet-4-20250514';
```
`claude-sonnet-4-20250514` **não existe na API da Anthropic**. Como as 2 organizações conectadas não têm `default_model` salvo no `config_values`, o agente usa esse fallback inválido e retorna erro 400.

### Problema 3 — `ai-generate` tem fallback desatualizado
`supabase/functions/ai-generate/index.ts`, linha 214:
```typescript
const model = configValues.default_model || "claude-3-5-sonnet-20241022";
```
Este é válido mas legado. Deve ser atualizado para o modelo mais recente.

### Problema 4 — Organizações sem `default_model` salvo
As 2 organizações com Claude conectado **não têm `default_model` nos `config_values`**. Mesmo que o schema seja corrigido, elas continuarão usando o fallback do código — que precisa ser corrigido também.

---

## IDs Corretos da API Anthropic

| Nome | API ID | Status |
|------|--------|--------|
| Claude Haiku 4.5 | `claude-haiku-4-5` | Mais rápido |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | Recomendado |
| Claude Opus 4.6 | `claude-opus-4-6` | Mais inteligente |
| Claude 3.7 Sonnet | `claude-3-7-sonnet-20250219` | Legado válido |
| Claude 3.5 Sonnet | `claude-3-5-sonnet-20241022` | Legado válido |
| Claude 3.5 Haiku | `claude-3-5-haiku-20241022` | Legado válido |

---

## Todas as Mudanças Necessárias

### 1. Migration SQL — Corrigir `admin_integrations.config_schema`

Atualizar o `config_schema` com os modelos corretos e `claude-sonnet-4-6` como padrão.

### 2. Migration SQL — Corrigir `organization_integrations` das 2 orgs existentes

Adicionar `default_model: "claude-sonnet-4-6"` para as organizações que não têm esse campo salvo, para que não dependam do fallback do código.

### 3. `supabase/functions/ai-agent-respond/index.ts` — Corrigir fallback

Linha 1811: Mudar `'claude-sonnet-4-20250514'` para `'claude-sonnet-4-6'`.

Este é o **causador direto do erro 400** nas chamadas do agente SDR.

### 4. `supabase/functions/ai-generate/index.ts` — Atualizar fallback

Linha 214: Mudar `"claude-3-5-sonnet-20241022"` para `"claude-sonnet-4-6"`.

---

## Arquivos Alterados

| Arquivo | Tipo | Mudança |
|---------|------|---------|
| `supabase/migrations/[timestamp]_fix_claude_models_final.sql` | Novo | Corrige schema + dados das orgs |
| `supabase/functions/ai-agent-respond/index.ts` | Modificado | Fallback linha 1811: modelo válido |
| `supabase/functions/ai-generate/index.ts` | Modificado | Fallback linha 214: modelo atualizado |

---

## Resultado Esperado

Após todas as mudanças:
- Dropdown mostrará: `claude-haiku-4-5`, `claude-sonnet-4-6`, `claude-opus-4-6`, + 3 legados válidos
- O agente SDR vai usar `claude-sonnet-4-6` (válido) como fallback — erro 400 resolvido
- As 2 organizações conectadas terão `default_model: "claude-sonnet-4-6"` salvo no banco
- A função `ai-generate` também usará modelo válido e atualizado
