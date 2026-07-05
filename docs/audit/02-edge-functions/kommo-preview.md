# kommo-preview

- LOC: 316
- Gatilho: HTTP autenticado no cliente. Proxy puro.
- Imports: nenhum SDK Supabase.
- Env vars: nenhuma.
- Tabelas: nenhuma.
- APIs externas: Kommo REST — várias chamadas paginadas para pré-visualizar leads/contacts/companies/pipelines antes do migrate.
- Observações: espelha a estrutura de `kommo-migrate` mas apenas conta e amostra. [INCERTO] deveria sanitizar subdomínio. Sem persistência.
