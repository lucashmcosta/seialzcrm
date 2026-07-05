# ct-backfill-once

Path: `supabase/functions/ct-backfill-once/index.ts` (72 LOC)

## Gatilho
- Chamada manual (`POST`) — script one-shot para reenviar template para lista fixa de contatos.

## Imports de `_shared/`
- `dispatch-whatsapp-send.ts`

## Env vars
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tabelas — LEITURA / ESCRITA
- Nenhuma direta — delega ao dispatcher, que grava em `messages`/`message_threads`.

## APIs externas
- Nenhuma direta.

## Observações
- **Código de operação com dados hardcoded**: `ORG_ID`, `TEMPLATE_ID` e lista de 21 contatos (nome + telefone) embutidos no arquivo. UUIDs e telefones não são secrets (não expostos aqui), mas configuração de produção não deveria viver em código.
- Provável candidato a remoção após o backfill concluído.
- Delay fixo de 300ms entre envios.
