

# Plano: Ajustes na Interface de WhatsApp Templates

## Resumo

Melhorar a exibição de status e clarificar o fluxo de aprovação de templates para os usuários.

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/components/whatsapp/templates/ApprovalStatusBadge.tsx` | Adicionar suporte ao status "draft" |
| `src/pages/whatsapp/TemplatesList.tsx` | Adicionar filtro "draft" e corrigir condição de submissão |
| `src/pages/whatsapp/TemplateDetail.tsx` | Adicionar mensagem de "Aguardando aprovação" e corrigir botão de submissão |

---

## Mudanças Detalhadas

### 1. ApprovalStatusBadge.tsx

**Adicionar suporte ao status "draft"** como alias de `not_submitted`:

```typescript
export type ApprovalStatus = 'approved' | 'pending' | 'rejected' | 'not_submitted' | 'draft';

const statusConfig: Record<ApprovalStatus, {...}> = {
  // ... mantém os existentes ...
  draft: {
    label: 'Rascunho',
    icon: AlertCircle,
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-100',
  },
};
```

---

### 2. TemplatesList.tsx

**Atualizar o tipo e filtro de status:**

```typescript
type FilterStatus = 'all' | 'approved' | 'pending' | 'rejected' | 'not_submitted' | 'draft';
```

**Adicionar opção "Rascunho" no filtro:**
```typescript
<SelectItem value="draft">Rascunho</SelectItem>
```

**Corrigir condição do botão "Submeter para Aprovação":**
Mudar de `pending || not_submitted` para apenas `draft || not_submitted`:

```typescript
{(template.status === 'not_submitted' || template.status === 'draft') && (
  <DropdownMenuItem onClick={() => openSubmitDialog(template.id)}>
    <Send className="w-4 h-4 mr-2" />
    Submeter para Aprovação
  </DropdownMenuItem>
)}
```

---

### 3. TemplateDetail.tsx

**Corrigir condição do botão de submissão:**
```typescript
const canSubmit = template.status === 'not_submitted' || template.status === 'draft';
```

**Adicionar card informativo quando status é "pending":**
Após o card de rejeição, adicionar:

```typescript
{template.status === 'pending' && (
  <Card className="border-yellow-200 bg-yellow-50 dark:border-yellow-900/50 dark:bg-yellow-950/30">
    <CardContent className="pt-4">
      <div className="flex items-start gap-3">
        <Clock className="w-5 h-5 text-yellow-600 dark:text-yellow-500 mt-0.5" />
        <div>
          <p className="font-medium text-yellow-800 dark:text-yellow-400">
            Aguardando Aprovação do WhatsApp
          </p>
          <p className="text-sm text-yellow-700 dark:text-yellow-500 mt-1">
            Este template foi submetido e está aguardando revisão do WhatsApp. 
            O processo pode levar de alguns minutos a 24 horas.
          </p>
        </div>
      </div>
    </CardContent>
  </Card>
)}
```

---

## Fluxo de Status

| Status | Cor | Descrição | Ação Disponível |
|--------|-----|-----------|-----------------|
| `draft` / `not_submitted` | Cinza | Template criado localmente, ainda não submetido | "Submeter para Aprovação" |
| `pending` | Amarelo | Submetido, aguardando aprovação do WhatsApp | Aguardar / Editar |
| `approved` | Verde | Aprovado pelo WhatsApp | Enviar mensagens |
| `rejected` | Vermelho | Rejeitado pelo WhatsApp | Ver motivo / Editar / Re-submeter |

---

## Comportamento Final

1. **Na lista de templates:**
   - Status exibido com cores corretas (verde/amarelo/vermelho/cinza)
   - Filtro inclui opção "Rascunho" 
   - Botão "Submeter para Aprovação" só aparece para `draft` ou `not_submitted`

2. **Na página de detalhes:**
   - Data de criação visível
   - Badge de status colorido
   - Card informativo amarelo quando "pending" explicando que está aguardando aprovação
   - Card vermelho com motivo quando "rejected"
   - Botão "Submeter para Aprovação" apenas para `draft` ou `not_submitted`

---

## Seção Técnica

### Mapeamento de Status do Backend

O backend pode retornar os seguintes status:
- `draft` - Template salvo localmente, não submetido
- `not_submitted` - Criado no Twilio, mas não submetido para aprovação
- `pending` - Submetido e aguardando aprovação do WhatsApp
- `approved` - Aprovado pelo WhatsApp
- `rejected` - Rejeitado pelo WhatsApp (com `rejection_reason`)

### Interface WhatsAppTemplate

```typescript
interface WhatsAppTemplate {
  status: string; // 'draft' | 'not_submitted' | 'pending' | 'approved' | 'rejected'
  rejection_reason?: string; // Presente quando status === 'rejected'
  created_at: string;
  // ...outros campos
}
```

