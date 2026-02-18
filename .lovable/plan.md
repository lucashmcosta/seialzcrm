
# Fix: Modo "Tornar Persuasivo" — Sem formatação e sem textos longos

## Problema identificado

Na linha 127 de `supabase/functions/ai-generate/index.ts`, o prompt do modo `persuasive` é:

```
Reescreva este texto de forma mais persuasiva, usando técnicas de copywriting para
engajar e converter o prospect. Mantenha a mensagem principal. Retorne apenas o texto reescrito
```

Não há nenhuma instrução para:
- Manter o texto **conciso** (o modelo expande demais)
- **Proibir** formatação WhatsApp (`*bold*`, `_italic_`, listas com `-`, etc.)

## O que será alterado

### `supabase/functions/ai-generate/index.ts` — linha 127

Substituir o prompt do modo `persuasive`:

**Antes:**
```typescript
userPrompt = `Reescreva este texto de forma mais persuasiva, usando técnicas de copywriting para engajar e converter o prospect. Mantenha a mensagem principal. Retorne apenas o texto reescrito:\n\n${context?.text}`;
```

**Depois:**
```typescript
userPrompt = `Reescreva este texto de forma mais persuasiva para WhatsApp. Regras obrigatórias:\n- Mantenha o mesmo tamanho aproximado do texto original (não expanda)\n- NÃO use formatação: sem asteriscos, sem underline, sem listas com hífen, sem emojis excessivos\n- Use linguagem direta, humana e conversacional\n- Mantenha a mensagem principal intacta\n- Retorne APENAS o texto reescrito, sem explicações\n\nTexto original:\n${context?.text}`;
```

## Arquivo alterado

| Arquivo | Linha | Mudança |
|---------|-------|---------|
| `supabase/functions/ai-generate/index.ts` | 127 | Adiciona restrições de tamanho e proibição de formatação no prompt do modo persuasivo |

Após a mudança, o edge function `ai-generate` será redeploy automaticamente.
