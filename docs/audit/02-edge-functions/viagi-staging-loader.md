# viagi-staging-loader

Path: `supabase/functions/viagi-staging-loader/index.ts` (40 LOC)

## Gatilho
- Chamada manual — recebe `{ rows: [...] }` e faz upsert direto em `viagi_csv_staging_2026_05_28`.

## Imports
- `jsr:@supabase/supabase-js@2`
- `npm:@supabase/supabase-js@2/cors` (import atípico — provavelmente **quebrado**; o pacote não expõe `/cors`. [INCERTO] — em runtime deve falhar ao importar `corsHeaders`, mas function existe deployada)

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA
- Nenhuma.

## Tabelas — ESCRITA
- `viagi_csv_staging_2026_05_28` (upsert onConflict `lead_id`)

## APIs externas
- Nenhuma.

## Observações
- **Comentário do próprio arquivo declara**: "One-shot loader ... Disposable — delete after meta-lead-ads-backfill-viagi runs apply."
- Tabela destino contém data no nome (`_2026_05_28`) — anti-padrão de schema (versionamento em nome de tabela).
- Import `npm:@supabase/supabase-js@2/cors` provavelmente incorreto. Alto risco de runtime error.
