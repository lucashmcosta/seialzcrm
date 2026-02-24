
# Corrigir Pesquisa de Oportunidades por Nome do Cliente

## Problema Identificado

A pesquisa server-side retorna **erro 400** porque o Supabase PostgREST nao suporta filtrar colunas de tabelas relacionadas (como `contacts.full_name`) dentro do `.or()`. A query atual:

```
.or(`title.ilike.%${searchTerm}%,contacts.full_name.ilike.%${searchTerm}%`)
```

...falha silenciosamente (retorna array vazio no frontend).

## Solucao

Fazer duas queries separadas e combinar os resultados:

1. **Query 1**: Buscar por titulo da oportunidade (`title.ilike`)
2. **Query 2**: Buscar contatos pelo nome (`full_name.ilike`), pegar seus IDs, e depois buscar oportunidades com esses `contact_id`s

Alternativamente (mais simples e eficiente): como os titulos das oportunidades ja contem o nome do cliente (ex: "Voo Atrasado - Fausto Jose Rangel dos santos"), podemos buscar apenas pelo titulo. Porem, para garantir que funcione em todos os casos, faremos as duas queries.

## Mudancas Tecnicas

### Arquivo: `src/pages/opportunities/OpportunitiesKanban.tsx`

Substituir o `useEffect` de pesquisa (linhas 126-154) para fazer duas queries e mesclar resultados:

```typescript
useEffect(() => {
  if (!searchTerm || searchTerm.length < 2 || !organization?.id) {
    setSearchResults(null);
    return;
  }

  const timer = setTimeout(async () => {
    // Query 1: Search by opportunity title
    const { data: byTitle } = await supabase
      .from('opportunities')
      .select(`*, contacts(full_name), users(full_name)`)
      .eq('organization_id', organization.id)
      .is('deleted_at', null)
      .ilike('title', `%${searchTerm}%`)
      .order('created_at', { ascending: false })
      .limit(100);

    // Query 2: Find contacts matching the name, then get their opportunities
    const { data: matchingContacts } = await supabase
      .from('contacts')
      .select('id')
      .eq('organization_id', organization.id)
      .ilike('full_name', `%${searchTerm}%`)
      .limit(50);

    let byContact: Opportunity[] = [];
    if (matchingContacts && matchingContacts.length > 0) {
      const contactIds = matchingContacts.map(c => c.id);
      const { data } = await supabase
        .from('opportunities')
        .select(`*, contacts(full_name), users(full_name)`)
        .eq('organization_id', organization.id)
        .is('deleted_at', null)
        .in('contact_id', contactIds)
        .order('created_at', { ascending: false })
        .limit(100);
      byContact = data || [];
    }

    // Merge results, removing duplicates by ID
    const merged = [...(byTitle || [])];
    const existingIds = new Set(merged.map(o => o.id));
    byContact.forEach(opp => {
      if (!existingIds.has(opp.id)) {
        merged.push(opp);
      }
    });

    setSearchResults(merged);
  }, 300);

  return () => clearTimeout(timer);
}, [searchTerm, organization?.id]);
```

### Resumo

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/opportunities/OpportunitiesKanban.tsx` | Substituir query `.or()` com coluna de tabela relacionada por duas queries separadas (por titulo + por contact_id) e mesclar resultados sem duplicatas |
