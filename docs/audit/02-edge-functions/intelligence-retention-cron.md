# intelligence-retention-cron

- LOC: 39
- Gatilho: cron via `INTELLIGENCE_WORKER_TOKEN`.
- Imports: `jsr:@supabase/supabase-js@2`.
- Env vars: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `INTELLIGENCE_WORKER_TOKEN`.
- Tabelas lidas: `intelligence_settings`.
- Tabelas escritas/deletadas: `audio_transcriptions` (purge por retenção).
- APIs externas: nenhuma.
- Observações: rotina simples de expurgo baseada em janela configurável por org em `intelligence_settings`.
