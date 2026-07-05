# fix-orphan-opportunities

- LOC: 282
- Gatilho: HTTP admin. SERVICE_ROLE.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `contacts`, `opportunities`.
- Tabelas escritas: `contacts` (dedupe/merge), `opportunities` (reatribuição de contact_id, delete de órfãs).
- APIs externas: `fetch(url, options)` helper — [INCERTO] provavelmente para chamar outra function interna.
- Observações: rotina de higienização. Relacionada a memory `features/opportunities/soft-delete-propagation` e `contacts/unification-strategy`.
