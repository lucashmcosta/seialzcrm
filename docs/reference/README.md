# Reference

Conteúdo regenerável a partir do sistema real.

| Subpasta | Fonte |
|---|---|
| [`database/`](database/) | Schema Supabase — **regenerado do banco vivo** (queries no rodapé de cada arquivo) |
| `api/` | Rotas REST do PostgREST + edge functions HTTP (a gerar) |
| `events/` | Eventos de webhook consumidos e emitidos (a gerar) |
| `generated/` | Artefatos gerados automaticamente (ex.: `src/integrations/supabase/types.ts`) |

## Ownership por domínio

[`catalog.md`](catalog.md) — mapeia cada tabela / trigger / edge function → módulo dono. Ver [ADR-0008](../decisions/0008-domain-ownership-catalog.md).

## Convenção
- Não editar manualmente arquivos em `database/` — regerá-los quando o schema mudar (ADR-0007).
- `catalog.md` é markdown editado à mão; objeto novo sem linha aqui = doc incompleta.

## Fontes atuais
- `docs/reference/database/database-full.md` — snapshot do banco de produção `qvmtzfvkhkhkhdpclzua` em 2026-07-04.
- `docs/reference/database/trigger-functions.sql` — corpos das 48 trigger functions.
- `src/integrations/supabase/types.ts` — gerado pela CLI Supabase.
- `docs/audit/02-edge-functions/` — 90 fichas de edge functions (histórico).
- `docs/audit/04-integracoes/` — 13 fichas de integrações (histórico).
