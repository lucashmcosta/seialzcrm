# Reference

Conteúdo regenerável a partir do sistema real.

| Subpasta | Fonte |
|---|---|
| `database/` | Schema Supabase (regenerável via introspecção) |
| `api/` | Rotas REST do PostgREST + edge functions HTTP |
| `events/` | Eventos de webhook consumidos e emitidos |
| `generated/` | Artefatos gerados automaticamente (ex.: `src/integrations/supabase/types.ts`) |

## Convenção
- Não editar manualmente arquivos aqui — regerá-los quando o schema/rota mudar.
- Enquanto não houver gerador automatizado, deixar a pasta vazia ou com uma nota clara sobre a origem.

## Fontes atuais (não regeradas ainda)
- `src/integrations/supabase/types.ts` — gerado pela CLI Supabase.
- `<supabase-tables>` no prompt do sistema (112 tabelas listadas).
- Auditoria de edge functions: `docs/audit/02-edge-functions/` (90 fichas).
- Integrações: `docs/audit/04-integracoes/` (13 fichas).
