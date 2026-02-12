
# Corrigir Status de Templates WhatsApp - Debug e Melhorias

## Diagnostico

O codigo de busca de ApprovalRequests esta estruturalmente correto, porem:
1. Nao ha logs para diagnosticar a resposta real da API do Twilio
2. O botao "Submeter para Aprovacao" nao aparece para templates `rejected` (so aparece para `draft` e `not_submitted`)
3. A sincronizacao pode nao ter sido executada desde o deploy das correcoes

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/twilio-whatsapp-templates/index.ts` | Adicionar logs detalhados no bloco de sync (GET e POST) |
| `supabase/functions/twilio-whatsapp-setup/index.ts` | Adicionar logs detalhados no Step 9 |
| `src/pages/settings/WhatsAppTemplates.tsx` | Incluir `rejected` na condicao do botao "Submeter" |

---

## Mudancas Detalhadas

### 1. Edge Function: twilio-whatsapp-templates/index.ts

**Nos dois blocos de sync (GET na linha ~79 e POST na linha ~212)**, adicionar logs antes e depois da chamada de ApprovalRequests:

```typescript
// ANTES do fetch
console.log(`[SYNC] Template ${template.sid} (${template.friendly_name}) - Fetching approval status...`)

// DEPOIS do fetch
console.log(`[SYNC] Template ${template.sid} - ApprovalRequests HTTP status: ${approvalResp.status}`)
console.log(`[SYNC] Template ${template.sid} - ApprovalRequests response:`, JSON.stringify(approvalData))
console.log(`[SYNC] Template ${template.sid} - approvalData.whatsapp:`, JSON.stringify(approvalData?.whatsapp))
console.log(`[SYNC] Template ${template.sid} - Final mapped status: ${templateStatus}, category: ${templateCategory}`)

// NO catch
console.error(`[SYNC] Template ${template.sid} - Error fetching approval:`, e?.message || e)
```

Esses logs sao essenciais para entender:
- Se a API retorna 200 ou outro status
- A estrutura real do JSON retornado (pode ser diferente de `{ whatsapp: { status: "..." } }`)
- Se o mapeamento de status esta funcionando

### 2. Edge Function: twilio-whatsapp-setup/index.ts

**No Step 9 (linha ~450-474)**, adicionar os mesmos logs:

```typescript
console.log(`[SETUP-SYNC] Template ${template.sid} - Fetching approval...`)
// ... apos fetch
console.log(`[SETUP-SYNC] Template ${template.sid} - HTTP ${approvalResp.status}`)
console.log(`[SETUP-SYNC] Template ${template.sid} - Response:`, JSON.stringify(approvalData))
console.log(`[SETUP-SYNC] Template ${template.sid} - Mapped: status=${templateStatus}, category=${templateCategory}`)
```

### 3. Frontend: WhatsAppTemplates.tsx

**Linha 334** - Adicionar `rejected` a condicao do botao "Submeter para Aprovacao":

```typescript
// ANTES:
{(template.status === 'not_submitted' || template.status === 'draft') && (

// DEPOIS:
{(template.status === 'not_submitted' || template.status === 'draft' || template.status === 'rejected') && (
```

Isso permite que templates rejeitados sejam re-submetidos apos correcao.

---

## Plano de Acao Apos Deploy

1. Deploy das edge functions com logs
2. Ir na tela de Templates WhatsApp e clicar "Sincronizar"
3. Verificar os logs da edge function `twilio-whatsapp-templates` para ver a resposta real da API
4. Com base nos logs, ajustar o mapeamento de status se a estrutura do JSON for diferente do esperado

## Resultado Esperado

- Logs detalhados mostrarao exatamente o que a API do Twilio retorna
- Botao "Submeter para Aprovacao" aparecera tambem para templates rejeitados
- Com os logs, sera possivel identificar e corrigir qualquer divergencia na estrutura da resposta
