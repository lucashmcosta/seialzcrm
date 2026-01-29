
# Plano: Unificar WhatsApp Templates como Aba de Settings

## Resumo

Consolidar a interface de WhatsApp Templates para que seja acessada exclusivamente como uma aba dentro de Settings, removendo a página separada e garantindo que tamanhos, espaçamentos e funcionalidades sigam os padrões do sistema.

---

## Problema Atual

1. **Duas implementações diferentes:**
   - `src/pages/settings/WhatsAppTemplates.tsx` (usada no Settings - simplificada)
   - `src/pages/whatsapp/TemplatesList.tsx` (página separada - mais completa)

2. **Inconsistências:**
   - A versão do Settings não usa o hook com Realtime
   - Faltam filtros avançados na versão Settings
   - Layout e tamanhos não seguem o padrão do sistema
   - ScrollArea com altura fixa (`h-[calc(100vh-400px)]`) causa problemas

3. **Navegação quebrada:**
   - Botões "Novo Template" e "Ver Detalhes" navegam para `/whatsapp/templates/*`
   - Essas páginas usam `<Layout>` próprio, quebrando a experiência de estar em Settings

---

## Solução

### Estratégia

1. **Manter rotas `/whatsapp/templates/*`** para criação/edição/detalhe (são páginas full-screen que faz sentido ter seu próprio Layout)

2. **Substituir o componente** `src/pages/settings/WhatsAppTemplates.tsx` por uma versão que:
   - Use o hook `useWhatsAppTemplates` atualizado (com Realtime)
   - Siga os padrões de layout das outras abas de Settings
   - Tenha filtros avançados
   - Use o componente `ApprovalStatusBadge` correto

3. **Ajustar TemplatesList.tsx** para usar uma lógica compartilhada

---

## Arquivos a Modificar

| Arquivo | Ação |
|---------|------|
| `src/pages/settings/WhatsAppTemplates.tsx` | Reescrever para usar o hook correto e seguir padrões |
| `src/pages/whatsapp/TemplatesList.tsx` | Ajustar para redirecionar para Settings quando acessado diretamente |
| `src/App.tsx` | Remover rota `/whatsapp/templates` da lista principal |

---

## Mudanças Detalhadas

### 1. Reescrever `src/pages/settings/WhatsAppTemplates.tsx`

**Estrutura atualizada:**

```typescript
import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ApprovalStatusBadge } from '@/components/whatsapp/templates/ApprovalStatusBadge';
import { useTemplates, useDeleteTemplate, useSyncTemplates, useSubmitForApproval } from '@/hooks/useWhatsAppTemplates';
import { useOrganization } from '@/hooks/useOrganization';
// ... outros imports

export default function WhatsAppTemplates() {
  // Usar o hook correto com Realtime
  const { organization } = useOrganization();
  const { data: templates, isLoading } = useTemplates(organization?.id);
  
  // ... mesma lógica de TemplatesList.tsx mas SEM o <Layout> wrapper
}
```

**Principais ajustes:**
- Remover `<ScrollArea>` com altura fixa
- Usar o hook `useTemplates` do `useWhatsAppTemplates.ts` (com Realtime)
- Usar `ApprovalStatusBadge` do novo componente
- Adicionar filtros (status, tipo, idioma)
- Seguir estrutura de header das outras abas (título + descrição + botões)
- Altura da tabela deve ser responsiva (não fixa)

### 2. Ajustar altura e responsividade

**Remover altura fixa:**
```tsx
// ❌ Antes
<ScrollArea className="h-[calc(100vh-400px)]">

// ✅ Depois - Sem altura fixa, deixar o layout gerenciar
<div className="space-y-4">
```

**Padrão de header igual outras abas:**
```tsx
<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
  <div>
    <h2 className="text-lg font-semibold text-foreground">WhatsApp Templates</h2>
    <p className="text-sm text-muted-foreground mt-1">
      Gerencie templates de mensagem para WhatsApp Business
    </p>
  </div>
  <div className="flex gap-2">
    <Button variant="outline" onClick={handleSync}>
      <RefreshCw className="w-4 h-4 mr-2" />
      Sincronizar
    </Button>
    <Button onClick={() => navigate('/whatsapp/templates/new')}>
      <Plus className="w-4 h-4 mr-2" />
      Novo Template
    </Button>
  </div>
</div>
```

### 3. Redirecionar `/whatsapp/templates` para Settings

**Opção A (recomendada):** Redirecionar para Settings com tab selecionada

```tsx
// src/pages/whatsapp/TemplatesList.tsx
import { Navigate } from 'react-router-dom';

export default function TemplatesList() {
  return <Navigate to="/settings?tab=whatsappTemplates" replace />;
}
```

**Ajustar Settings.tsx para aceitar query param:**
```tsx
import { useSearchParams } from 'react-router-dom';

// Dentro do componente
const [searchParams] = useSearchParams();
const initialTab = searchParams.get('tab') || 'general';
const [selectedTab, setSelectedTab] = useState(initialTab);
```

### 4. Manter rotas de detalhe/edição

As rotas abaixo **continuam funcionando** com seus próprios `<Layout>`:
- `/whatsapp/templates/new` → `TemplateForm.tsx`
- `/whatsapp/templates/:id` → `TemplateDetail.tsx`
- `/whatsapp/templates/:id/edit` → `TemplateForm.tsx`

**Ajustar botão "Voltar" nessas páginas:**
```tsx
// Atualmente navega para '/whatsapp/templates'
// Mudar para '/settings?tab=whatsappTemplates'

<Button variant="ghost" size="icon" onClick={() => navigate('/settings?tab=whatsappTemplates')}>
  <ArrowLeft className="w-4 h-4" />
</Button>
```

---

## Comportamento Final

1. **Acessar WhatsApp Templates:**
   - Ir em `/settings` → clicar na aba "WhatsApp Templates"
   - Ou acessar `/settings?tab=whatsappTemplates` diretamente

2. **Lista de templates:**
   - Tabela responsiva sem altura fixa
   - Filtros por status, tipo e idioma
   - Status badges coloridos corretos
   - Atualização em tempo real via Supabase Realtime

3. **Criar/editar/visualizar template:**
   - Navega para página full-screen com Layout próprio
   - Botão "Voltar" retorna para Settings na aba correta

4. **Rota legada:**
   - `/whatsapp/templates` redireciona automaticamente para Settings

---

## Checklist de Validação

- [ ] Aba "WhatsApp Templates" aparece em Settings quando WhatsApp está conectado
- [ ] Tabela de templates segue tamanhos do sistema
- [ ] Filtros funcionam corretamente
- [ ] Status badges mostram cores corretas
- [ ] Realtime funciona (status atualiza automaticamente)
- [ ] "Novo Template" abre a página de criação
- [ ] "Ver Detalhes" abre a página de detalhe
- [ ] Botão "Voltar" nas sub-páginas retorna para Settings
- [ ] `/whatsapp/templates` redireciona para Settings
- [ ] Mobile: NativeSelect funciona para trocar abas

---

## Seção Técnica

### Mudanças no Roteamento

```typescript
// App.tsx - ANTES
<Route path="/whatsapp/templates" element={<ProtectedRoute><TemplatesList /></ProtectedRoute>} />
<Route path="/whatsapp/templates/new" element={<ProtectedRoute><TemplateForm /></ProtectedRoute>} />
// ...

// App.tsx - DEPOIS
// Rota da lista redireciona para Settings
<Route path="/whatsapp/templates" element={<Navigate to="/settings?tab=whatsappTemplates" replace />} />
<Route path="/whatsapp/templates/new" element={<ProtectedRoute><TemplateForm /></ProtectedRoute>} />
<Route path="/whatsapp/templates/:id" element={<ProtectedRoute><TemplateDetail /></ProtectedRoute>} />
<Route path="/whatsapp/templates/:id/edit" element={<ProtectedRoute><TemplateForm /></ProtectedRoute>} />
```

### Hook com Realtime (já implementado)

O hook `useWhatsAppTemplates.ts` já está configurado com Supabase Realtime. A aba de Settings só precisa usar o hook `useTemplates(organization?.id)` para ter atualização automática.

### Componentes Reutilizados

- `ApprovalStatusBadge` - já existe e está correto
- `ConfirmDialog` - para confirmações de exclusão
- Dialog de submissão - para selecionar categoria antes de submeter

