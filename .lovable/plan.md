

# Plano: Remover Geração de Botões de Texto do Agente IA

## Status Atual

### ✅ Já Implementado (Railway)
- Content Templates via Twilio (botões interativos nativos)
- `interactive` e `buttons` usam templates
- Se template falhar → lança erro (sem fallback texto)

### ❌ Falta Fazer
1. **Prompt do AI agent** - pode ainda gerar `[BUTTONS]`
2. **Processamento de `[BUTTONS]`** no `ai-agent.ts` do Railway

---

## Análise do Código Lovable

Verifiquei os prompts dos agentes da Blueviza e a função `generatePromptFromWizard`:

**Achados:**
- O `generatePromptFromWizard` no Wizard (SDRAgentWizard.tsx) **não contém instruções sobre `[BUTTONS]`**
- Os prompts armazenados dos agentes Blueviza também **não mencionam `[BUTTONS]`**
- A edge function `ai-agent-respond` **não injeta instruções sobre botões**

**Conclusão:** A tag `[BUTTONS]` provavelmente está sendo gerada:
1. Por comportamento aprendido da IA (padrões de resposta)
2. Ou por instruções antigas no prompt antes da migração comportamental
3. Ou por lógica no backend Railway que instrui a IA a gerar opções

---

## Solução Proposta

### Parte 1: Adicionar Instrução Explícita para NÃO Gerar Botões

Modificar o Wizard para adicionar regra explícita no prompt gerado:

**Arquivo:** `src/components/settings/SDRAgentWizard.tsx`

**Localização:** Função `generatePromptFromWizard`, seção "REGRAS FINAIS" (linha ~502)

**Adicionar:**
```typescript
## REGRAS FINAIS
✅ Responda SOMENTE em português brasileiro
✅ Use informações da BASE DE CONHECIMENTO quando disponível
✅ Personalize com o nome do cliente quando disponível
❌ NUNCA invente informações
❌ NUNCA use tags como [BUTTONS], [OPTIONS] ou formate opções numeradas (1. 2. 3.)
❌ NUNCA ofereça "escolha uma opção" - responda naturalmente
```

### Parte 2: Adicionar Regra na Edge Function Supabase

Mesmo que o Railway processe a maioria das mensagens, a edge function deve ter a mesma regra para consistência.

**Arquivo:** `supabase/functions/ai-agent-respond/index.ts`

**Localização:** Função `buildSystemPrompt`, seção "REGRAS IMPORTANTES" (linha ~1190)

**Adicionar nas regras:**
```typescript
9. NUNCA use tags [BUTTONS] ou formate opções como lista numerada (1. 2. 3.)
10. NUNCA ofereça "escolha uma opção" - responda de forma natural e fluída
```

### Parte 3: Instruções para o Backend Railway

Você precisa fazer no código Railway:

1. **Remover processamento de `[BUTTONS]`** no `ai-agent.ts`:
   - Desabilitar detecção de `[BUTTONS]` na resposta
   - Remover conversão para texto numerado
   - Remover atualização de `button_options` na thread

2. **Adicionar mesma instrução anti-botões** no prompt do agente:
   ```javascript
   prompt += `
   ❌ NUNCA use tags [BUTTONS] ou formate opções como lista numerada (1. 2. 3.)
   ❌ NUNCA ofereça "escolha uma opção" - responda naturalmente
   `;
   ```

---

## Arquivos a Modificar no Lovable

| Arquivo | Modificação |
|---------|-------------|
| `src/components/settings/SDRAgentWizard.tsx` | Adicionar regra anti-botões em `generatePromptFromWizard` |
| `supabase/functions/ai-agent-respond/index.ts` | Adicionar regra anti-botões em `buildSystemPrompt` |

---

## Arquivos a Modificar no Railway (Manual)

| Arquivo | Modificação |
|---------|-------------|
| `src/services/ai-agent.ts` | Remover lógica de processamento `[BUTTONS]` |
| `src/services/ai-agent.ts` | Adicionar regra anti-botões no prompt |

---

## Resumo

```text
┌─────────────────────────────────────────────────────────────┐
│                    FLUXO ATUAL (COM PROBLEMA)               │
├─────────────────────────────────────────────────────────────┤
│ IA gera resposta → inclui [BUTTONS] → Railway converte      │
│ para texto numerado → "1. Opção A  2. Opção B"              │
└─────────────────────────────────────────────────────────────┘

                              ↓

┌─────────────────────────────────────────────────────────────┐
│                    FLUXO DESEJADO                           │
├─────────────────────────────────────────────────────────────┤
│ IA gera resposta → SEM tags → texto natural enviado         │
│ Se quiser botões → usa WhatsApp Template (aprovado)         │
└─────────────────────────────────────────────────────────────┘
```

---

## Seção Técnica

### Mudança 1: SDRAgentWizard.tsx (linha ~506)

```diff
## REGRAS FINAIS
✅ Responda SOMENTE em português brasileiro
✅ Use informações da BASE DE CONHECIMENTO quando disponível
✅ Personalize com o nome do cliente quando disponível
❌ NUNCA invente informações
+❌ NUNCA use tags [BUTTONS], [OPTIONS] ou formate opções numeradas (1. 2. 3.)
+❌ NUNCA ofereça "escolha uma das opções abaixo" - responda naturalmente
```

### Mudança 2: ai-agent-respond/index.ts (linha ~1197)

```diff
## REGRAS IMPORTANTES
1. Responda APENAS com a mensagem para o cliente...
...
8. Revise as ÚLTIMAS 3 mensagens do usuário...
+9. NUNCA use tags [BUTTONS] ou formate opções como lista numerada (1. 2. 3.)
+10. NUNCA ofereça "escolha uma opção" - responda de forma natural e fluída
```

---

## Próximos Passos Após Implementação

1. ✅ Lovable: Aprovar este plano para aplicar mudanças
2. 📋 Railway: Aplicar as mudanças manuais descritas acima
3. 🔄 Regenerar prompts: Editar e salvar os agentes Blueviza para aplicar novo prompt
4. 🧪 Testar: Enviar mensagens e verificar que não há mais `[BUTTONS]` ou opções numeradas

