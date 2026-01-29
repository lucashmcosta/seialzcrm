
# Plano: Corrigir Atualização Automática ao Remover Templates

## Diagnóstico

Analisando os logs de rede, identifiquei que:

1. O DELETE retorna sucesso (Status 204)
2. O React Query está invalidando corretamente a query (faz GET logo após)
3. **Problema**: O backend Railway faz **soft delete** (marca `is_active = false`) mas o GET ainda retorna templates inativos
4. A lista não atualiza porque os dados retornados são praticamente os mesmos

## Solução

Implementar **duas correções** complementares:

1. **Filtro de Templates Ativos**: Filtrar automaticamente templates com `is_active = false` da lista
2. **Atualização Otimista**: Remover o template da cache localmente antes de esperar a resposta do servidor

---

## Mudanças Detalhadas

### 1. Filtrar templates inativos no hook

**Arquivo**: `src/hooks/useWhatsAppTemplates.ts`

Adicionar filtro no `useTemplates` para remover templates inativos:

```typescript
export function useTemplates(orgId: string | undefined) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ['whatsapp-templates', orgId],
    queryFn: async () => {
      const templates = await whatsappService.listTemplates(orgId!);
      // Filtrar apenas templates ativos
      return templates.filter(t => t.is_active !== false);
    },
    enabled: !!orgId,
  });
  
  // ... resto do código
}
```

### 2. Atualização otimista no delete

**Arquivo**: `src/hooks/useWhatsAppTemplates.ts`

Modificar `useDeleteTemplate` para remover o template da cache imediatamente:

```typescript
export function useDeleteTemplate() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: ({ orgId, templateId }: { orgId: string; templateId: string }) =>
      whatsappService.deleteTemplate(orgId, templateId),
    
    // Atualização otimista - remove da lista antes da resposta
    onMutate: async ({ orgId, templateId }) => {
      // Cancelar queries em andamento
      await queryClient.cancelQueries({ queryKey: ['whatsapp-templates', orgId] });
      
      // Snapshot do estado anterior
      const previousTemplates = queryClient.getQueryData(['whatsapp-templates', orgId]);
      
      // Remover otimisticamente
      queryClient.setQueryData(
        ['whatsapp-templates', orgId],
        (old: WhatsAppTemplate[] | undefined) => 
          old?.filter(t => t.id !== templateId) || []
      );
      
      return { previousTemplates };
    },
    
    // Reverter em caso de erro
    onError: (err, { orgId }, context) => {
      if (context?.previousTemplates) {
        queryClient.setQueryData(['whatsapp-templates', orgId], context.previousTemplates);
      }
      toast({ variant: 'destructive', description: err.message });
    },
    
    // Sincronizar com servidor após sucesso
    onSettled: (data, error, { orgId }) => {
      queryClient.invalidateQueries({ queryKey: ['whatsapp-templates', orgId] });
    },
    
    onSuccess: () => {
      toast({ description: 'Template removido!' });
    },
  });
}
```

---

## Benefícios

| Melhoria | Descrição |
|----------|-----------|
| **UX Instantânea** | Template desaparece imediatamente ao clicar em excluir |
| **Robustez** | Se o servidor falhar, o template reaparece na lista |
| **Consistência** | Templates inativos nunca aparecem na lista |

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/hooks/useWhatsAppTemplates.ts` | Adicionar filtro de ativos + atualização otimista |

---

## Comportamento Final

1. Usuário clica em "Excluir" → **Template desaparece instantaneamente**
2. Em background, DELETE é enviado ao servidor
3. Se sucesso: Lista permanece atualizada
4. Se erro: Template reaparece com mensagem de erro

---

## Seção Técnica

### Optimistic Updates no React Query

O React Query suporta atualizações otimistas através dos callbacks:

- `onMutate`: Executado antes da mutation - usado para atualizar cache localmente
- `onError`: Executado se mutation falhar - reverte para estado anterior
- `onSettled`: Executado sempre após mutation - sincroniza com servidor

### Por que não depender apenas do invalidateQueries?

O `invalidateQueries` força um refetch, mas se o backend ainda retornar o template (com `is_active = false`), a lista não muda visualmente. A combinação de filtro + otimismo resolve isso.
