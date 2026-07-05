# kommo-validate

- LOC: 92
- Gatilho: HTTP. Proxy puro para validar credenciais Kommo.
- Imports: `jsr:@supabase/supabase-js@2` importado mas sem uso significativo de tabelas.
- Env vars: nenhuma referenciada.
- Tabelas: nenhuma.
- APIs externas: Kommo REST — `GET /api/v4/account` (ou similar) para validar `access_token` e `subdomain`.
- Observações: usado no fluxo de conexão. [INCERTO] sanitização de subdomínio.
