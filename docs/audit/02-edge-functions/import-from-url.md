# import-from-url

Path: `supabase/functions/import-from-url/index.ts` (217 LOC)

## Gatilho
- Chamada do frontend — importa conteúdo de uma URL para virar item de knowledge.

## Imports de `_shared/`
- Nenhum.

## Env vars
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — ESCRITA
- `knowledge_items` (insert)

## APIs externas
- `fetch()` genérico à URL informada — [INCERTO] sem allowlist detectada, potencial SSRF (deve validar host).

## Observações
- Verificar sanitização de URL/host para prevenir SSRF interno (ex.: `http://169.254.169.254/`).
