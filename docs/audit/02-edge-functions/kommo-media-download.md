# kommo-media-download

- LOC: 157
- Gatilho: HTTP autenticado. Baixa mídia de `activities` importadas do Kommo e reenvia para Storage.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`.
- Tabelas lidas: `user_organizations`, `activities`.
- Tabelas escritas: `activities` (atualiza `media_url`/status).
- APIs externas: `fetch(activity.media_source_url)` — download direto da URL fornecida pela mídia Kommo. Depois faz `storage.from(...).upload()`.
- Observações: [INCERTO] risco SSRF — `media_source_url` vem de dados importados; deveria validar host. Sem retry/backoff explícito.
