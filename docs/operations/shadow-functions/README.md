# Shadow functions — código recuperado do deploy ad-hoc (2026-07-05)

Registro das 3 edge functions que existiam deployadas **fora do repo** (drift P0 #2, [`../drift/2026-07-04.md`](../drift/2026-07-04.md)), deployadas via dashboard em 2026-05 com entrypoint `source/index.ts` / `source/functions/...` em vez de `source/supabase/functions/...`. Código recuperado via API de leitura do Supabase em 2026-07-05.

| Função | Versão deployada | Destino | Justificativa |
|---|---|---|---|
| `marketing-campaign-enrich` | v14 (2026-05-04) | **Adicionada ao repo** em [`supabase/functions/marketing-campaign-enrich/`](../../../supabase/functions/marketing-campaign-enrich/index.ts) | Código de produção: roda em cron a cada 6h (`marketing-campaign-enrich-cron`) e por trigger (`fn_marketing_campaign_enrich_async`). Auth interna via `validateServiceRoleAuth`. |
| `meta-capi-raw-test` | v14 (2026-05-05) | **Órfã — arquivada aqui** ([`meta-capi-raw-test.index.ts`](meta-capi-raw-test.index.ts)); remover do dashboard futuramente | Ferramenta de debug que envia payload arbitrário ao Meta CAPI. ⚠️ **Auth fraca**: só checa a existência de header `Bearer` — qualquer chamada com a anon key passa e consegue disparar eventos CAPI arbitrários com o token/pixel da org. Não deve voltar como produção sem correção de auth. |
| `twilio-message-debug` | v14 (2026-05-04) | **Órfã — arquivada aqui** ([`twilio-message-debug.index.ts`](twilio-message-debug.index.ts)); remover do dashboard futuramente | O próprio cabeçalho diz "DESCARTÁVEL… pode ser DELETADA depois do uso". Investigação CTWA já concluída (ver [`../audits/2026-07-ctwa-janela-72h.md`](../audits/2026-07-ctwa-janela-72h.md)). Única função do projeto com `verify_jwt = true`. |

## Estado e próximos passos

- **Nada foi deletado nem deployado.** As 3 continuam ACTIVE no dashboard, nas versões ad-hoc v14.
- `marketing-campaign-enrich`: no próximo deploy via pipeline (push → Lovable), a versão do repo substitui a ad-hoc — os `_shared` embutidos no bundle eram idênticos aos do repo (verificado export a export em 2026-07-05); risco de regressão baixo, mas o **push equivale a deploy** e requer aprovação.
- `meta-capi-raw-test` e `twilio-message-debug`: propor **remoção do dashboard** em janela aprovada (são debug tools concluídas; a primeira tem auth fraca). Até lá, este diretório é o registro do código.
- Os arquivos `.index.ts` aqui são **arquivo morto** — fora do caminho de deploy (`supabase/functions/`), não são compilados nem publicados.
