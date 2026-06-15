## Objetivo

Nos modais "Oportunidades que entraram" e "Oportunidades fechadas" da tela **Início** (`/dashboard`), destacar o **nome do contato** como informação principal de cada linha. Título da oportunidade e nome do vendedor ficam como secundários.

## Como está hoje

Cada linha mostra:
- **Principal:** Título da oportunidade (ex: "Oportunidade - Isaías leite")
- **Secundário:** "Criada em DD/MM/AAAA" ou "Fechada em DD/MM/AAAA"
- **Direita:** Valor (R$ 0,00)

## Como vai ficar

- **Principal (negrito):** Nome do contato (fallback: "(sem contato)")
- **Secundário linha 1:** Título da oportunidade
- **Secundário linha 2:** "Criada/Fechada em DD/MM/AAAA · Vendedor: Nome"
- **Direita:** Valor (sem alteração)

## Mudanças técnicas

Arquivo único: `src/pages/Dashboard.tsx`

1. **Query em `fetchStats`:** adicionar joins de contato e vendedor ao `select`:
   ```
   .select('id, title, status, created_at, updated_at, close_date, amount,
            contact_id, owner_user_id,
            contacts:contact_id(full_name),
            users:owner_user_id(full_name)')
   ```

2. **Tipo `OppRow`:** acrescentar `contacts?: { full_name: string } | null` e `users?: { full_name: string } | null`.

3. **Render da linha no `Dialog`:** reorganizar em três níveis tipográficos — contato (`text-sm font-medium`), título da oportunidade (`text-xs text-muted-foreground`) e linha de metadados com data + vendedor (`text-xs text-muted-foreground`).

Nenhuma mudança em hooks, lógica de negócio, KPIs, gráficos ou em outras telas.