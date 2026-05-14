## Problemas

1. **Lenta**: a cada tecla digitada no campo de busca, dispara uma query no Supabase imediatamente (sem debounce). Digitar "Lucas Costa" = 11 requisições.
2. **Imprecisa**:
   - A busca usa `full_name.ilike.%Lucas Costa%` — só acha se o nome contiver exatamente a string "Lucas Costa" naquela ordem. Não acha "Costa, Lucas", "Lucas Henrique Costa" se houver variação, "lucas  costa" (2 espaços), etc.
   - Busca por telefone usa o termo cru — digitar "(11) 99999" não bate com `+5511999990000` no banco.
   - Não reseta a página para 1 quando o usuário troca o termo, podendo cair numa página vazia.

## Correção (apenas em `src/pages/contacts/ContactsList.tsx`)

1. **Debounce de 300ms** no `searchTerm` antes de disparar `fetchContacts`. Criar um estado `debouncedSearch` via `useEffect` + `setTimeout`/`clearTimeout`, e usar ele na query e nas dependências do effect.

2. **Tokenizar a busca**:
   - Trim + split por espaços (`/\s+/`), filtrar vazios.
   - Para cada token, montar um grupo `or(full_name.ilike.%token%, email.ilike.%token%, phone.ilike.%digitsOnly%)`.
   - Combinar os grupos com `.and(...)` para que TODOS os tokens precisem bater (em qualquer campo). Resultado: "Lucas Costa" acha "Costa Silva Lucas", "Lucas Henrique Costa", etc.
   - Para o token de telefone, extrair só dígitos (`token.replace(/\D/g, '')`); se vazio, omitir o predicado de phone daquele token.

3. **Reset de página**: quando `debouncedSearch` mudar, setar `currentPage = 1`. Aplicar a mesma lógica em `handleSelectAllContacts` (usar `debouncedSearch` em vez de `searchTerm`).

4. **Verificação**: digitar nomes parciais e fora de ordem ("costa lucas", "lucas") deve retornar resultados; latência percebida deve cair (uma única query 300ms após parar de digitar).

Nenhuma mudança de schema, RLS, ou outros arquivos.
