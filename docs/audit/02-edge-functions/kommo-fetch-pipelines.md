# kommo-fetch-pipelines

- LOC: 111
- Gatilho: HTTP autenticado no cliente. Recebe `access_token` e `subdomain` no body.
- Imports: nenhum SDK Supabase — proxy puro.
- Env vars: nenhuma.
- Tabelas: nenhuma.
- APIs externas: Kommo REST — `GET https://<subdomain>.kommo.com/api/v4/leads/pipelines` e `GET .../users`.
- Observações: proxy read-only para descoberta de pipelines e usuários Kommo. [INCERTO] não sanitiza `subdomain` (memory `development/edge-function-subdomain-sanitization` indica que deveria). Access token é passado pelo frontend — não persistido nesta função.
