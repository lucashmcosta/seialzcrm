

# Plano: Corrigir Formato das Variáveis no Template

## Problema Identificado

A função `extractVariables` está retornando as variáveis no formato incorreto:

| Atual (errado) | Esperado (correto) |
|----------------|-------------------|
| `{ key: "{{1}}", name: "", example: "" }` | `{ key: "1", name: "", example: "" }` |

Isso causa erro no backend que espera apenas o número da variável.

## Arquivo a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/lib/template-validation.ts` | Corrigir função `extractVariables` para retornar apenas o número |

## Mudança Específica

**Antes (linhas 67-75):**
```typescript
export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+)\}\}/g);
  return matches ? [...new Set(matches)].sort((a, b) => {
    const numA = parseInt(a.replace(/[{}]/g, ''));
    const numB = parseInt(b.replace(/[{}]/g, ''));
    return numA - numB;
  }) : [];
}
```

**Depois:**
```typescript
export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+)\}\}/g);
  if (!matches) return [];
  
  // Remove duplicatas e extrai apenas o número
  const unique = [...new Set(matches)];
  return unique
    .map(match => match.replace(/[{}]/g, ''))  // "{{1}}" vira "1"
    .sort((a, b) => parseInt(a) - parseInt(b));
}
```

## Resultado Esperado

Quando o usuário digitar `Olá {{1}}, sua compra {{2}} foi confirmada`:
- **Antes:** `["{{1}}", "{{2}}"]`
- **Depois:** `["1", "2"]`

O backend receberá:
```json
{
  "variables": [
    { "key": "1", "name": "nome_cliente", "example": "Lucas" },
    { "key": "2", "name": "numero_pedido", "example": "12345" }
  ]
}
```

## Impacto na Interface

O componente `VariablesTable.tsx` também será afetado positivamente:
- A coluna "Variável" mostrará `1`, `2`, etc. ao invés de `{{1}}`, `{{2}}`
- A exibição fica mais limpa e consistente com o esperado

