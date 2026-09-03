# Sentry SEIALZ-27 — `readProgressDenominator is not defined`

## Diagnóstico

Fatos do evento (da captura):

- `ReferenceError: readProgressDenominator is not defined`, unhandled
- mechanism: `auto.browser.browserapierrors.addEventListener`, handler `onTimeUpdate`
- **environment: development (100%)**, URL `3e7cbf89-...lovableproject.com/commercial` (preview do Lovable)
- release `2026-08-19T14-45-04-265Z`, 4 eventos, **0 usuários**, first e last seen 15 dias atrás

Busca no código atual: **não existe nenhuma referência** a
`readProgressDenominator` nem a handler `onTimeUpdate` em `src/`
(`rg` retornou vazio; só há `ontimeupdate` em `CallRecordingPlayer.tsx`, sem
essa variável). Ou seja, o identificador pertenceu a uma versão intermediária
do player de áudio durante a edição no preview, já removida — não existe em
produção.

Confirma isso o fato de os 4 eventos serem de um único release de preview, em
ambiente `development`, e nunca terem voltado.

## Causa raiz

Não é um bug de produção. É ruído de telemetria: o Sentry está inicializado
também no preview/dev (`environment: import.meta.env.MODE`), então erros de
código em edição — inclusive estados transitórios que só existem por minutos —
viram issues permanentes ao lado dos erros reais dos usuários.

## Correção mínima proposta

1. **Só reportar em produção.** Em `src/instrument.ts`, deixar de enviar
   eventos quando o ambiente não é produção (não inicializar o Sentry, ou
   descartar no `beforeSend` quando `environment !== "production"`). Nada mais
   muda: DSN, release, tracing e todos os filtros atuais ficam iguais.
2. **No Sentry:** resolver/arquivar SEIALZ-27 (issue de preview, sem impacto).

Sem mudanças no player de áudio, em RPC, RLS, build ou infraestrutura.

## Alternativa, se você quiser manter visibilidade do preview

Manter o envio em development, mas separar por ambiente no Sentry (filtro de
ambiente nas views/alertas) para que o preview não polua a fila de produção.
Diga qual das duas prefere e eu implemento apenas essa.
