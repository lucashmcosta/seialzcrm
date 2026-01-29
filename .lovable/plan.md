

# Plano: Modal de Seleção de Categoria para Submissão

## Resumo

Adicionar um dialog de seleção de categoria que aparece antes de submeter o template para aprovação. A opção "Submeter para Aprovação" será exibida para templates com status `pending` ou `not_submitted`.

---

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/pages/whatsapp/TemplatesList.tsx` | Adicionar dialog de categoria e expandir condição de status |
| `src/pages/whatsapp/TemplateDetail.tsx` | Adicionar dialog de categoria e expandir condição de status |

---

## Mudanças Detalhadas

### 1. `src/pages/whatsapp/TemplatesList.tsx`

**Adicionar imports do Dialog:**
```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
```

**Adicionar novos estados:**
```typescript
const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
const [selectedCategory, setSelectedCategory] = useState<string>('UTILITY');
// Reutilizar selectedTemplateId já existente
```

**Nova função para abrir o modal:**
```typescript
const openSubmitDialog = (templateId: string) => {
  setSelectedTemplateId(templateId);
  setSelectedCategory('UTILITY');
  setSubmitDialogOpen(true);
};

const confirmSubmitForApproval = async () => {
  if (selectedTemplateId && organization?.id) {
    await submitMutation.mutateAsync({
      orgId: organization.id,
      templateId: selectedTemplateId,
      category: selectedCategory,
    });
    setSubmitDialogOpen(false);
    setSelectedTemplateId(null);
  }
};
```

**Alterar condição no DropdownMenuItem (linha 309):**
```typescript
// De: template.status === 'not_submitted'
// Para: template.status === 'not_submitted' || template.status === 'pending'
{(template.status === 'not_submitted' || template.status === 'pending') && (
  <DropdownMenuItem onClick={() => openSubmitDialog(template.id)}>
    <Send className="w-4 h-4 mr-2" />
    Submeter para Aprovação
  </DropdownMenuItem>
)}
```

**Adicionar Dialog de Categoria (após ConfirmDialog existente):**
```typescript
<Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
  <DialogContent size="sm">
    <DialogHeader>
      <DialogTitle>Submeter para Aprovação</DialogTitle>
      <DialogDescription>
        Selecione a categoria do template antes de submeter para aprovação do WhatsApp.
      </DialogDescription>
    </DialogHeader>
    
    <div className="space-y-3">
      <Label>Categoria</Label>
      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione a categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="UTILITY">Utilidade</SelectItem>
          <SelectItem value="MARKETING">Marketing</SelectItem>
          <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        A categoria determina as regras de envio e custos do WhatsApp.
      </p>
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>
        Cancelar
      </Button>
      <Button 
        onClick={confirmSubmitForApproval} 
        disabled={submitMutation.isPending}
      >
        {submitMutation.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Send className="w-4 h-4 mr-2" />
        )}
        Submeter
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

### 2. `src/pages/whatsapp/TemplateDetail.tsx`

**Adicionar imports do Dialog:**
```typescript
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
```

**Adicionar novos estados:**
```typescript
const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
const [selectedCategory, setSelectedCategory] = useState<string>('UTILITY');
```

**Alterar condição canSubmit (linha 138):**
```typescript
// De: const canSubmit = template.status === 'not_submitted';
// Para:
const canSubmit = template.status === 'not_submitted' || template.status === 'pending';
```

**Nova função para abrir o modal:**
```typescript
const openSubmitDialog = () => {
  setSelectedCategory(template?.category || 'UTILITY');
  setSubmitDialogOpen(true);
};

const confirmSubmitForApproval = async () => {
  if (!organization?.id || !id) return;
  await submitMutation.mutateAsync({
    orgId: organization.id,
    templateId: id,
    category: selectedCategory,
  });
  setSubmitDialogOpen(false);
};
```

**Alterar botão de submissão (linhas 168-181):**
```typescript
{canSubmit && (
  <Button
    variant="outline"
    onClick={openSubmitDialog}  // Abre o dialog ao invés de submeter direto
    disabled={submitMutation.isPending}
  >
    <Send className="w-4 h-4 mr-2" />
    Submeter para Aprovação
  </Button>
)}
```

**Adicionar Dialog de Categoria (após ConfirmDialog existente):**
```typescript
<Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
  <DialogContent size="sm">
    <DialogHeader>
      <DialogTitle>Submeter para Aprovação</DialogTitle>
      <DialogDescription>
        Selecione a categoria do template "{template?.friendly_name}" antes de submeter.
      </DialogDescription>
    </DialogHeader>
    
    <div className="space-y-3">
      <Label>Categoria</Label>
      <Select value={selectedCategory} onValueChange={setSelectedCategory}>
        <SelectTrigger>
          <SelectValue placeholder="Selecione a categoria" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="UTILITY">Utilidade</SelectItem>
          <SelectItem value="MARKETING">Marketing</SelectItem>
          <SelectItem value="AUTHENTICATION">Autenticação</SelectItem>
        </SelectContent>
      </Select>
      <p className="text-xs text-muted-foreground">
        A categoria determina as regras de envio e custos do WhatsApp.
      </p>
    </div>
    
    <DialogFooter>
      <Button variant="outline" onClick={() => setSubmitDialogOpen(false)}>
        Cancelar
      </Button>
      <Button 
        onClick={confirmSubmitForApproval} 
        disabled={submitMutation.isPending}
      >
        {submitMutation.isPending ? (
          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
        ) : (
          <Send className="w-4 h-4 mr-2" />
        )}
        Submeter
      </Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
```

---

## Comportamento Final

1. **Lista de Templates:**
   - Menu de ações mostra "Submeter para Aprovação" para templates com status `pending` ou `not_submitted`
   - Ao clicar, abre modal com dropdown de categoria
   - Após selecionar e confirmar, chama `POST /api/whatsapp/templates/:id/approve?orgId={orgId}` com body `{ category: "UTILITY" }`
   - Lista atualiza automaticamente após sucesso

2. **Detalhe do Template:**
   - Botão "Submeter para Aprovação" aparece para status `pending` ou `not_submitted`
   - Abre o mesmo modal de seleção de categoria
   - Categoria pré-selecionada é a do template atual (se existir) ou UTILITY

---

## Seção Técnica

### Endpoint Chamado
```
POST /api/whatsapp/templates/:id/approve?orgId={orgId}
Body: { "category": "UTILITY" | "MARKETING" | "AUTHENTICATION" }
```

### Categorias do WhatsApp
| Categoria | Descrição |
|-----------|-----------|
| UTILITY | Mensagens transacionais (confirmações, atualizações) |
| MARKETING | Promoções e campanhas |
| AUTHENTICATION | OTPs e códigos de verificação |

### Hook Utilizado
`useSubmitForApproval()` do arquivo `src/hooks/useWhatsAppTemplates.ts` - já implementado e funcionando.

