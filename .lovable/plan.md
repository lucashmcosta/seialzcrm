
# Plano: Interface de Gerenciamento de WhatsApp Templates

## Resumo

Implementar uma interface completa para gerenciar WhatsApp Templates, migrando as chamadas de Supabase Edge Functions para o novo backend Railway. A implementação inclui:
- Serviço centralizado para comunicação com Railway
- Hook React Query para gerenciamento de estado
- 3 páginas novas (Lista, Formulário, Detalhes)
- 5 componentes reutilizáveis
- Validações em tempo real com Zod

---

## Arquivos a Criar

| Arquivo | Descrição |
|---------|-----------|
| `src/services/whatsapp.ts` | Serviço centralizado para chamadas ao Railway |
| `src/lib/template-validation.ts` | Schemas Zod para validação de templates |
| `src/hooks/useWhatsAppTemplates.ts` | Hook React Query para templates |
| `src/pages/whatsapp/TemplatesList.tsx` | Página de listagem com filtros e tabela |
| `src/pages/whatsapp/TemplateForm.tsx` | Formulário multi-step criar/editar |
| `src/pages/whatsapp/TemplateDetail.tsx` | Página de detalhes do template |
| `src/components/whatsapp/templates/WhatsAppPreview.tsx` | Mockup de celular com preview |
| `src/components/whatsapp/templates/ApprovalStatusBadge.tsx` | Badge colorido por status |
| `src/components/whatsapp/templates/TemplateTypeSelector.tsx` | Dropdown com ícones por tipo |
| `src/components/whatsapp/templates/VariablesTable.tsx` | Tabela de variáveis com exemplos |
| `src/components/whatsapp/templates/SendTemplateModal.tsx` | Modal reutilizável para envio |

## Arquivos a Modificar

| Arquivo | Modificação |
|---------|-------------|
| `src/App.tsx` | Adicionar 4 rotas para `/whatsapp/templates/*` |
| `src/pages/settings/WhatsAppTemplates.tsx` | Migrar para usar novo serviço Railway |
| `src/components/whatsapp/CreateTemplateDialog.tsx` | Migrar para usar novo serviço Railway |

---

## Implementação por Arquivo

### 1. `src/services/whatsapp.ts`

Serviço centralizado para comunicação com o backend Railway:

```typescript
const API_BASE = `${import.meta.env.VITE_RAILWAY_WHATSAPP_URL}/api/whatsapp`;

export interface WhatsAppTemplate {
  id: string;
  organization_id: string;
  twilio_content_sid: string;
  friendly_name: string;
  language: string;
  template_type: string;
  body: string;
  header?: string;
  footer?: string;
  variables?: { key: string; name: string; example: string }[];
  status: string;
  rejection_reason?: string;
  category?: string;
  is_active: boolean;
  last_synced_at?: string;
  created_at: string;
  updated_at: string;
}

export interface CreateTemplateInput {
  organization_id: string;
  friendly_name: string;
  language: string;
  template_type: string;
  category: string;
  body: string;
  header?: string;
  footer?: string;
  variables?: { key: string; name: string; example: string }[];
  buttons?: { id: string; title: string }[];
  actions?: { type: string; title: string; value?: string }[];
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error.message || 'Erro na requisição');
  }
  return response.json();
}

export const whatsappService = {
  // Listar templates
  listTemplates: async (orgId: string): Promise<WhatsAppTemplate[]> => {
    const response = await fetch(`${API_BASE}/templates?orgId=${orgId}`);
    return handleResponse<WhatsAppTemplate[]>(response);
  },

  // Buscar template específico
  getTemplate: async (orgId: string, templateId: string): Promise<WhatsAppTemplate> => {
    const response = await fetch(`${API_BASE}/templates/${templateId}?orgId=${orgId}`);
    return handleResponse<WhatsAppTemplate>(response);
  },

  // Criar template
  createTemplate: async (data: CreateTemplateInput): Promise<WhatsAppTemplate> => {
    const response = await fetch(`${API_BASE}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<WhatsAppTemplate>(response);
  },

  // Atualizar template
  updateTemplate: async (templateId: string, data: Partial<CreateTemplateInput>): Promise<WhatsAppTemplate> => {
    const response = await fetch(`${API_BASE}/templates/${templateId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<WhatsAppTemplate>(response);
  },

  // Deletar template
  deleteTemplate: async (orgId: string, templateId: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/templates/${templateId}?orgId=${orgId}`, {
      method: 'DELETE',
    });
    if (!response.ok) throw new Error('Erro ao deletar template');
  },

  // Submeter para aprovação
  submitForApproval: async (orgId: string, templateId: string, category: string): Promise<void> => {
    const response = await fetch(`${API_BASE}/templates/${templateId}/approve?orgId=${orgId}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ category }),
    });
    if (!response.ok) throw new Error('Erro ao submeter para aprovação');
  },

  // Sincronizar com Twilio
  syncWithTwilio: async (orgId: string): Promise<{ synced: number }> => {
    const response = await fetch(`${API_BASE}/templates/sync?orgId=${orgId}`, {
      method: 'POST',
    });
    return handleResponse<{ synced: number }>(response);
  },

  // Enviar mensagem com template
  sendTemplate: async (data: {
    organization_id: string;
    to: string;
    template_id: string;
    variables?: Record<string, string>;
  }): Promise<{ messageId: string }> => {
    const response = await fetch(`${API_BASE}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return handleResponse<{ messageId: string }>(response);
  },
};
```

### 2. `src/lib/template-validation.ts`

Validações com Zod seguindo regras do WhatsApp:

```typescript
import { z } from 'zod';

// Validar nome snake_case
export const templateNameSchema = z.string()
  .min(1, 'Nome é obrigatório')
  .max(512, 'Máximo 512 caracteres')
  .regex(/^[a-z][a-z0-9_]*$/, 'Use apenas letras minúsculas, números e underscores');

// Validar variáveis sequenciais
function validateVariableSequence(body: string): boolean {
  const matches = body.match(/\{\{(\d+)\}\}/g);
  if (!matches) return true;
  
  const numbers = matches.map(m => parseInt(m.replace(/[{}]/g, ''))).sort((a, b) => a - b);
  for (let i = 0; i < numbers.length; i++) {
    if (numbers[i] !== i + 1) return false;
  }
  return true;
}

// Validar variáveis não adjacentes
function validateVariableSpacing(body: string): boolean {
  return !/\{\{\d+\}\}\s*\{\{\d+\}\}/.test(body);
}

export const templateBodySchema = z.string()
  .min(1, 'Corpo é obrigatório')
  .max(1024, 'Máximo 1024 caracteres')
  .refine(validateVariableSequence, 'Variáveis devem ser sequenciais: {{1}}, {{2}}, etc')
  .refine(validateVariableSpacing, 'Adicione texto entre as variáveis');

// Schema para Quick Reply
export const quickReplyButtonSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1).max(20, 'Título máximo 20 caracteres'),
});

// Schema para CTA
export const ctaActionSchema = z.object({
  type: z.enum(['url', 'phone', 'copy_code']),
  title: z.string().min(1).max(25, 'Título máximo 25 caracteres'),
  value: z.string().optional(),
});

// Schema completo do template
export const templateSchema = z.object({
  friendly_name: templateNameSchema,
  language: z.enum(['pt_BR', 'en', 'es', 'pt-BR']),
  category: z.enum(['UTILITY', 'MARKETING', 'AUTHENTICATION']),
  template_type: z.enum(['text', 'quick-reply', 'list-picker', 'call-to-action', 'media']),
  body: templateBodySchema,
  header: z.string().max(60).optional(),
  footer: z.string().max(60).optional(),
  buttons: z.array(quickReplyButtonSchema).max(10).optional(),
  actions: z.array(ctaActionSchema).max(3).optional(),
});

// Extrair variáveis do body
export function extractVariables(body: string): string[] {
  const matches = body.match(/\{\{(\d+)\}\}/g);
  return matches ? [...new Set(matches)].sort() : [];
}
```

### 3. `src/hooks/useWhatsAppTemplates.ts`

Hook React Query para gerenciamento de estado:

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { whatsappService, WhatsAppTemplate, CreateTemplateInput } from '@/services/whatsapp';
import { useToast } from '@/hooks/use-toast';

export function useTemplates(orgId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-templates', orgId],
    queryFn: () => whatsappService.listTemplates(orgId!),
    enabled: !!orgId,
  });
}

export function useTemplate(orgId: string | undefined, templateId: string | undefined) {
  return useQuery({
    queryKey: ['whatsapp-template', orgId, templateId],
    queryFn: () => whatsappService.getTemplate(orgId!, templateId!),
    enabled: !!orgId && !!templateId,
  });
}

export function useCreateTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (data: CreateTemplateInput) => whatsappService.createTemplate(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({ description: 'Template criado com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useUpdateTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<CreateTemplateInput> }) =>
      whatsappService.updateTemplate(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({ description: 'Template atualizado!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ orgId, templateId }: { orgId: string; templateId: string }) =>
      whatsappService.deleteTemplate(orgId, templateId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({ description: 'Template removido!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useSyncTemplates() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: (orgId: string) => whatsappService.syncWithTwilio(orgId),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({ description: `${data.synced} templates sincronizados!` });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useSubmitForApproval() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ orgId, templateId, category }: { orgId: string; templateId: string; category: string }) =>
      whatsappService.submitForApproval(orgId, templateId, category),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates'] });
      toast({ description: 'Template submetido para aprovação!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}

export function useSendTemplate() {
  const { toast } = useToast();

  return useMutation({
    mutationFn: whatsappService.sendTemplate,
    onSuccess: () => {
      toast({ description: 'Mensagem enviada com sucesso!' });
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', description: error.message });
    },
  });
}
```

### 4. `src/pages/whatsapp/TemplatesList.tsx`

Página de listagem com filtros, tabela e ações:

**Estrutura:**
- Header com título "WhatsApp Templates" (sem subtítulo, seguindo design system)
- Botões "Sincronizar" e "+ Novo Template"
- Filtros: Tipo (dropdown), Status (dropdown), Idioma (dropdown)
- Tabela com colunas: Nome, Tipo, Idioma, Status, Criado, Ações
- Badges coloridos por status:
  - `approved`: `bg-green-100 text-green-800`
  - `pending`: `bg-yellow-100 text-yellow-800`
  - `rejected`: `bg-red-100 text-red-800`
  - `not_submitted`: `bg-slate-100 text-slate-600`
- Menu de ações: Ver, Editar (se não aprovado), Deletar, Submeter
- Paginação
- Estado vazio com CTA

**Padrões a seguir:**
- Usar `Layout` como wrapper (página CRM)
- Importar componentes UI existentes
- Usar `useTemplates` hook
- Usar `ConfirmDialog` para deleção

### 5. `src/pages/whatsapp/TemplateForm.tsx`

Formulário multi-step com 3 etapas:

**Step 1 - Informações Básicas:**
- `friendly_name` (Input com validação snake_case em tempo real)
- `language` (Select: pt_BR, en, es)
- `category` (Select: UTILITY, MARKETING, AUTHENTICATION)
- `template_type` (TemplateTypeSelector com ícones)

**Step 2 - Conteúdo (dinâmico por tipo):**
- **text**: Textarea + botão inserir variável
- **quick-reply**: Textarea + lista de botões (max 10, título max 20 chars)
- **list-picker**: Textarea + botão principal + lista items (max 10)
- **call-to-action**: Textarea + lista ações (max 2 URL + 1 phone)
- **media**: Textarea + URL da mídia

**Step 3 - Variáveis:**
- VariablesTable detectando {{1}}, {{2}}, etc
- Campos: Número (readonly), Nome descritivo, Valor de exemplo

**Layout:**
- 2 colunas: Formulário à esquerda (60%), Preview à direita (40%)
- Navegação entre steps com validação
- Botões: Cancelar, Anterior, Próximo, Salvar

### 6. `src/pages/whatsapp/TemplateDetail.tsx`

Página de visualização do template:

- Card com informações completas
- Badge de status com ApprovalStatusBadge
- Se rejeitado: card vermelho destacado com motivo
- Botões: Voltar, Editar (se não aprovado), Deletar, Submeter para aprovação
- Seção "Testar envio" com PhoneInput e campos de variáveis
- Preview do template estilo WhatsApp

### 7. Componentes Reutilizáveis

#### `WhatsAppPreview.tsx`
- Mockup de celular WhatsApp
- Balão verde com body renderizado
- Variáveis substituídas pelos exemplos
- Botões se quick-reply ou CTA
- Timestamp e checks (✓✓)
- Estilo visual autêntico do WhatsApp

#### `ApprovalStatusBadge.tsx`
- Recebe `status: 'approved' | 'pending' | 'rejected' | 'not_submitted'`
- Cores específicas por status
- Ícone + label

#### `TemplateTypeSelector.tsx`
- Dropdown com ícones e descrições
- Tipos: text, quick-reply, list-picker, call-to-action, media
- Ícones Lucide apropriados

#### `VariablesTable.tsx`
- Props: `body: string`, `variables: Variable[]`, `onChange`
- Auto-detecta variáveis do body
- Campos: Número, Nome, Exemplo
- Validação de exemplos obrigatórios

#### `SendTemplateModal.tsx`
- Dialog reutilizável
- Dropdown de templates aprovados
- PhoneInput para destinatário
- Campos dinâmicos para variáveis
- Preview da mensagem final
- Botão enviar com loading

### 8. Modificações no `App.tsx`

Adicionar lazy imports e rotas:

```typescript
// Lazy load WhatsApp Template pages
const TemplatesList = lazy(() => import('./pages/whatsapp/TemplatesList'));
const TemplateForm = lazy(() => import('./pages/whatsapp/TemplateForm'));
const TemplateDetail = lazy(() => import('./pages/whatsapp/TemplateDetail'));

// Dentro de Routes, adicionar:
<Route path="/whatsapp/templates" element={
  <ProtectedRoute><TemplatesList /></ProtectedRoute>
} />
<Route path="/whatsapp/templates/new" element={
  <ProtectedRoute><TemplateForm /></ProtectedRoute>
} />
<Route path="/whatsapp/templates/:id" element={
  <ProtectedRoute><TemplateDetail /></ProtectedRoute>
} />
<Route path="/whatsapp/templates/:id/edit" element={
  <ProtectedRoute><TemplateForm /></ProtectedRoute>
} />
```

---

## Padrões e Convenções do Projeto

### Design System Base44
- Layout: Usar `Layout` como wrapper (página CRM)
- Headers: Apenas `<h1>` sem subtítulos
- Botões: `rounded-full` (estilo pill)
- Cards: `rounded-xl`
- Cores: Tokens semânticos (`bg-card`, `text-foreground`, etc.)

### Componentes UI Reutilizados
- `Button` de `@/components/ui/button`
- `Input`, `Textarea` de `@/components/ui`
- `Select` de `@/components/ui/select`
- `Badge` de `@/components/ui/badge`
- `Card` de `@/components/ui/card`
- `Table` de `@/components/application/table/table`
- `ConfirmDialog` de `@/components/ui/confirm-dialog`
- `PhoneInput` de `@/components/ui/phone-input`

### Padrão de Hooks
- React Query para fetch/mutations
- Toast para feedback de sucesso/erro
- Invalidate queries após mutations

---

## Ordem de Implementação

1. **Infraestrutura base** (arquivos de serviço e hooks)
   - `src/services/whatsapp.ts`
   - `src/lib/template-validation.ts`
   - `src/hooks/useWhatsAppTemplates.ts`

2. **Componentes reutilizáveis**
   - `ApprovalStatusBadge.tsx`
   - `TemplateTypeSelector.tsx`
   - `WhatsAppPreview.tsx`
   - `VariablesTable.tsx`

3. **Páginas principais**
   - `TemplatesList.tsx`
   - `TemplateForm.tsx`
   - `TemplateDetail.tsx`

4. **Integração e modal**
   - Rotas no `App.tsx`
   - `SendTemplateModal.tsx`

5. **Migração de código existente**
   - `WhatsAppTemplates.tsx` (Settings) → usar novo serviço
   - `CreateTemplateDialog.tsx` → usar novo serviço

---

## Seção Técnica

### Variável de Ambiente

Adicionar ao `.env`:
```
VITE_RAILWAY_WHATSAPP_URL=https://seialz-backend-production.up.railway.app
```

### Tipos TypeScript

Interface principal `WhatsAppTemplate` e `WhatsAppTemplateAction` conforme especificado no contexto.

### Validações em Tempo Real

| Validação | Regex/Função | Mensagem |
|-----------|--------------|----------|
| Nome snake_case | `/^[a-z][a-z0-9_]*$/` | "Use apenas letras minúsculas, números e underscores" |
| Variáveis sequenciais | Função custom | "Variáveis devem ser sequenciais" |
| Variáveis não adjacentes | `/\{\{\d+\}\}\s*\{\{\d+\}\}/` | "Adicione texto entre as variáveis" |
| Body max chars | `max(1024)` | "Máximo 1024 caracteres" |
| Quick-reply buttons | `max(10)` | "Máximo 10 botões" |
| Button title | `max(20)` | "Título máximo 20 caracteres" |
| CTA actions | `max(3)` | "Máximo 3 ações" |

### Estados de Loading

- Lista: Skeleton rows usando padrão existente
- Botões: Loader2 spinning + disabled
- Sincronização: Botão disabled com spinner
- Envio: Modal com loading no botão

