

# Plano: Corrigir Status de Templates WhatsApp + Multi-tenant

## Problema

1. **Status hardcoded**: Tanto na edge function `twilio-whatsapp-templates` (sync, linha 93) quanto na `twilio-whatsapp-setup` (linha 460), todo template sincronizado recebe `status: 'approved'` fixo, ignorando o status real de aprovacao no Twilio
2. **Falta buscar ApprovalRequests**: A API `GET /v1/Content/{contentSid}/ApprovalRequests` nunca e chamada - e ela que tem o status real (draft, pending, approved, rejected)
3. **Submit for approval**: O frontend ja tem o botao e dialog, mas depende do backend Railway. Precisamos que a edge function tambem suporte isso
4. **Multi-tenant**: O Messaging Service ja usa orgId no nome (linha 169), mas a sincronizacao de templates nao valida o contexto da org

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/twilio-whatsapp-templates/index.ts` | Buscar ApprovalRequests no sync; adicionar acao submit-approval |
| `supabase/functions/twilio-whatsapp-setup/index.ts` | Buscar ApprovalRequests no sync de templates (Step 9) |

---

## Mudancas Detalhadas

### 1. Edge Function: twilio-whatsapp-templates/index.ts

**No bloco de sync (linhas 79-101)** - Para cada template retornado pela Content API, buscar o status real de aprovacao:

```typescript
// Para cada template, buscar approval status
let templateStatus = 'draft' // default se nunca submetido

try {
  const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`
  const approvalResp = await fetch(approvalUrl, {
    headers: { 'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`) }
  })
  
  if (approvalResp.ok) {
    const approvalData = await approvalResp.json()
    // O campo whatsapp retorna o status da aprovacao WhatsApp
    if (approvalData.whatsapp) {
      const whatsappStatus = approvalData.whatsapp.status
      // Mapear status do Twilio para nosso sistema
      const statusMap: Record<string, string> = {
        'approved': 'approved',
        'pending': 'pending', 
        'rejected': 'rejected',
        'paused': 'rejected',
        'disabled': 'rejected',
        'unsubmitted': 'draft',
      }
      templateStatus = statusMap[whatsappStatus] || 'draft'
    }
  }
} catch (e) {
  console.warn('Error fetching approval for', template.sid, e)
}
```

Depois usar `templateStatus` ao inves de `'approved'` no upsert (linha 93):
```typescript
status: templateStatus,
```

Tambem extrair a `category` real do approval request quando disponivel, e o `rejection_reason` quando rejeitado.

**Adicionar acao `submit-approval` (novo bloco POST)** - Quando `action === 'submit-approval'`:

```typescript
if (action === 'submit-approval') {
  const { organizationId, templateId, category } = await req.json()
  
  // Buscar template do banco para pegar o twilio_content_sid
  const { data: template } = await supabase
    .from('whatsapp_templates')
    .select('twilio_content_sid, friendly_name')
    .eq('id', templateId)
    .eq('organization_id', organizationId)
    .single()
  
  // Buscar credenciais da integracao
  // ... (mesmo pattern de buscar organization_integrations)
  
  // Chamar API do Twilio
  const approvalUrl = `https://content.twilio.com/v1/Content/${template.twilio_content_sid}/ApprovalRequests`
  const approvalResp = await fetch(approvalUrl, {
    method: 'POST',
    headers: {
      'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: template.friendly_name,
      category: category, // UTILITY, MARKETING, AUTHENTICATION
    })
  })
  
  // Atualizar status no banco para 'pending'
  await supabase
    .from('whatsapp_templates')
    .update({ status: 'pending', category: category.toLowerCase() })
    .eq('id', templateId)
    .eq('organization_id', organizationId)
  
  return response com sucesso
}
```

### 2. Edge Function: twilio-whatsapp-setup/index.ts

**No Step 9 (linhas 446-472)** - Mesmo fix: buscar ApprovalRequests para cada template antes do upsert:

```typescript
// Buscar approval status para cada template
let templateStatus = 'draft'
let templateCategory = 'utility'
let rejectionReason = null

try {
  const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`
  const approvalResp = await fetch(approvalUrl, {
    headers: { 'Authorization': authHeader }
  })
  if (approvalResp.ok) {
    const approvalData = await approvalResp.json()
    if (approvalData.whatsapp) {
      const statusMap = { 'approved': 'approved', 'pending': 'pending', 'rejected': 'rejected', 'paused': 'rejected', 'disabled': 'rejected', 'unsubmitted': 'draft' }
      templateStatus = statusMap[approvalData.whatsapp.status] || 'draft'
      templateCategory = (approvalData.whatsapp.category || 'utility').toLowerCase()
      rejectionReason = approvalData.whatsapp.rejection_reason || null
    }
  }
} catch (e) {
  console.warn('Error fetching approval:', e)
}
```

Depois usar no upsert:
```typescript
status: templateStatus,        // ao inves de 'approved'
category: templateCategory,    // ao inves de 'utility'
rejection_reason: rejectionReason,
```

### 3. Hook useWhatsAppTemplates - Redirecionar sync e submit para edge function

O `useSyncTemplates` e `useSubmitForApproval` atualmente usam o backend Railway via `whatsappService`. Precisamos que tambem funcionem via a edge function diretamente (para nao depender do Railway para status). Duas opcoes:

**Opcao A** (mais simples): Manter o Railway como proxy mas corrigir o status la tambem
**Opcao B** (recomendada): Fazer sync e submit direto pela edge function, ja que ela tem acesso as credenciais

Vou implementar a **Opcao B** - criar funcoes no hook que chamam a edge function diretamente:

```typescript
// No useSyncTemplates, trocar para chamar edge function
mutationFn: async (orgId: string) => {
  const { data, error } = await supabase.functions.invoke('twilio-whatsapp-templates', {
    body: { organizationId: orgId },
    // Usar GET com action=sync via query params nao funciona em invoke, 
    // entao mudar a edge function para aceitar POST com action no body
  })
  if (error) throw error
  return data
}
```

Para isso, a edge function `twilio-whatsapp-templates` precisa aceitar `action` tambem no body (POST), nao so nos query params.

---

## Resumo das Mudancas por Arquivo

### twilio-whatsapp-templates/index.ts
1. No sync: buscar `GET /v1/Content/{sid}/ApprovalRequests` para cada template
2. Mapear status real (draft/pending/approved/rejected) no upsert
3. Salvar category e rejection_reason reais
4. Adicionar acao `submit-approval` que chama `POST /v1/Content/{sid}/ApprovalRequests`
5. Aceitar action no body (POST) alem de query params

### twilio-whatsapp-setup/index.ts
1. No Step 9: buscar ApprovalRequests para cada template
2. Usar status/category/rejection_reason reais no upsert

### src/hooks/useWhatsAppTemplates.ts
1. `useSyncTemplates`: chamar edge function ao inves do Railway
2. `useSubmitForApproval`: chamar edge function ao inves do Railway

---

## Fluxo Final

```text
Sincronizar:
1. Chama edge function twilio-whatsapp-templates com action=sync
2. Edge function busca templates via Content API
3. Para CADA template, busca ApprovalRequests
4. Salva no banco com status REAL (draft/pending/approved/rejected)
5. Frontend mostra badges com cores corretas

Submeter para Aprovacao:
1. Usuario clica "Submeter para Aprovacao" em template draft
2. Seleciona categoria (UTILITY/MARKETING/AUTHENTICATION)
3. Edge function chama POST /v1/Content/{sid}/ApprovalRequests
4. Atualiza status no banco para 'pending'
5. Badge muda para amarelo "Aguardando Aprovacao"

Multi-tenant:
- Messaging Service: ja usa orgId no nome (CRM WhatsApp - {orgId})
- Templates: filtrados por organization_id no banco
- Credenciais: buscadas da integracao da organizacao
```

---

## Checklist de Validacao

- [ ] Templates sincronizados mostram status real (nao todos como "Aprovado")
- [ ] Templates draft mostram badge cinza "Rascunho"
- [ ] Templates pending mostram badge amarelo "Aguardando Aprovacao"
- [ ] Templates approved mostram badge verde "Aprovado"
- [ ] Templates rejected mostram badge vermelho "Rejeitado"
- [ ] Botao "Submeter para Aprovacao" funciona para templates draft
- [ ] Apos submeter, status muda para pending
- [ ] Botao "Sincronizar" re-verifica status de todos os templates
- [ ] Cada organizacao ve apenas seus proprios templates

