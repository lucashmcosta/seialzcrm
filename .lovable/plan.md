# Restaurar a entrega do OTP (whatsapp-otp-send)

O commit 54ade4b8 tem só adições (10 arquivos, +259 linhas) e não mexe em `useOverview.ts`. Por isso dá para reaplicar sem conflito com o trabalho do Lucas.

## O que será feito
1. Recriar os 3 arquivos da função a partir do commit: `supabase/functions/whatsapp-otp-send/index.ts`, `logic.ts` e `logic_test.ts`. Isso inclui o mapa Auxilius → `AUXILIUS_OTP_HMAC_SECRET`.
2. Recolocar o arquivo de migration `20261111162329_1c204a0a-...sql` exatamente como estava. Ele **não** será executado.
3. Reaplicar só as linhas adicionadas pelo commit, sem mexer no resto desses arquivos:
   - o bloco `[functions.whatsapp-otp-send] verify_jwt = false` no `config.toml`
   - a tipagem de `whatsapp_otp_send_log` em `types.ts`
   - a documentação em `catalog.md`, `.env.example`, `getting-started.md` e `AGENTS.md`
4. Não tocar em `src/pages/marketing/_hooks/useOverview.ts` nem no secret.
5. Conferir que cada arquivo restaurado ficou igual ao do commit 54ade4b8 e que `useOverview.ts` não mudou em relação ao main atual (versão do commit 180bb07f).
6. Rodar os testes Deno da função e republicá-la.
7. Testar a função no ar: OPTIONS deve dar 405 e uma chamada sem assinatura deve dar 401. Nenhum envio real.

## Relatório final
- Quais arquivos foram restaurados e se cada um ficou igual ao commit
- Resultado dos testes
- Status da publicação
- Respostas 405 e 401 da função no ar
- Confirmação de que `useOverview.ts` ficou intacto
