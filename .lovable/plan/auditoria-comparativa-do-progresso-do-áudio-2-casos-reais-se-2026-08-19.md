# Auditoria comparativa do progresso do áudio (2 casos reais) — sem tocar no player

Nenhuma alteração no `AudioMessagePlayer.tsx` nesta fase: sem mexer em listeners, `src`, `preload`, retry, error handling, proxy, seek ou lifecycle do `<audio>`.

## O que já foi verificado (read-only, antes de qualquer plano)

Consulta ao banco e inspeção dos arquivos reais mais recentes da Central (`messages` com `media_type='audio'`):

- Distribuição de mídia de áudio: 60.418 registros em `…supabase.co/storage/v1/object/public/whatsapp-media` (ogg/opus), 24 `.mp4`, 17 antigos em `api.twilio.com` (últimos em 25/06), 2 `.amr`, 2 `.mp3`, 1 `.webm`.
- Ou seja: praticamente 100% do tráfego atual é **ogg/opus servido pelo Storage, URL direta (sem proxy)** — tanto inbound Meta (`meta-inbound/…ogg`) quanto outbound gravado no CRM.
- Amostra de 5 arquivos (2 outbound CRM + 3 inbound Meta) baixados e inspecionados com ffprobe: **todos com duração legível** (12,6s / 53,4s / 6,0s / 112,2s / 179,4s), `content-length` presente e `accept-ranges: bytes`.

Consequência: a hipótese "arquivo sem duração" **não se sustenta como causa única** — os arquivos têm duração e o servidor suporta range. Portanto a divergência entre o caso A (funciona) e o caso B (trava) é **runtime no navegador**, não uma propriedade do arquivo. A causa exata segue `[INCERTO]` e é o objetivo desta auditoria.

Hipótese alternativa que a auditoria precisa distinguir (ainda não confirmada): o laço `requestAnimationFrame` é iniciado só dentro de `togglePlay`, e o efeito de listeners (`[src, srcOk, messageId, threadId, mediaType]`) chama `cancelAnimationFrame` na limpeza. Se qualquer dessas dependências mudar durante a reprodução (re-render por realtime na lista), o rAF é cancelado e o `currentTime` do React congela enquanto o áudio continua tocando — exatamente o sintoma intermitente relatado.

## Como a auditoria será feita

O ambiente de preview deste projeto usa Supabase externo, então não é possível automatizar login em `/commercial` daqui. A captura será feita com um **coletor temporário de telemetria somente-leitura**, e removido no fim:

1. Um módulo dev (`src/lib/dev/audioProbe.ts`) exposto em `window.__audioProbe`, carregado **apenas** quando `?audioProbe=1` está na URL. Ele não altera o player: apenas encontra os elementos `<audio>` já renderizados, anexa listeners passivos de observação (`loadedmetadata`, `canplay`, `durationchange`, `timeupdate`) para *contagem*, e faz amostragem em 0s/1s/3s/5s.
2. Um contador de ticks do rAF e do estado React do `currentTime` lidos de forma não intrusiva: comparação entre `audio.currentTime` (verdade do elemento) e o texto de tempo renderizado no player (reflexo do state React). Divergência entre os dois isola exatamente "rAF/state parado" vs "elemento parado".
3. Você abre `/commercial?audioProbe=1`, dá play no áudio A (bolinha acompanha) e depois no áudio B (bolinha travada), 3–5s cada. O coletor imprime no console o bloco no formato pedido e copia o JSON.

Campos capturados por áudio: `MESSAGE_ID`, `PROVIDER`, `MEDIA_TYPE`, `AUDIO_SRC_KIND` (storage direto / proxy / twilio), `READY_STATE`, `NETWORK_STATE`, `PAUSED`, `DURATION`, `CURRENT_TIME_START/AFTER_1S/AFTER_3S`, `RAF_TICKS`, `REACT_CURRENT_TIME_STATE`, `COMPUTED_PROGRESS`, `SEEKABLE_RANGES`, `BUFFERED_RANGES`, `LOADEDMETADATA_FIRED`, `CANPLAY_FIRED`, `DURATIONCHANGE_FIRED`, `TIMEUPDATE_FIRED`.

Cada `MESSAGE_ID` coletado é depois cruzado no banco (provider do endpoint, `media_type`, URL) e o arquivo correspondente inspecionado com ffprobe, para responder às perguntas 1, 2, 6, 7 e 8 com dado, não com suposição.

## Entrega da auditoria

Relatório no formato pedido: `WORKING_AUDIO`, `BROKEN_AUDIO`, `RAF_WORKS_BOTH`, `CURRENT_TIME_STATE_WORKS_BOTH`, `DURATION_DIFFERENCE`, `PROVIDER_CORRELATION`, `CODEC_CORRELATION`, `ROOT_CAUSE`, `MINIMAL_VISUAL_ONLY_FIX` — mais a resposta item a item às 8 perguntas.

## Depois da auditoria (nada disso agora)

O fix será proposto em mensagem separada, para sua aprovação, e restrito ao cálculo visual do progresso:

- se a causa for duração não-finita: `visualDuration` derivado apenas para a bolinha, sem escrever no `<audio>` e sem listeners de alta frequência;
- se a causa for o rAF cancelado por re-render: correção mínima na condição de cancelamento/retomada do laço visual, sem tocar em `src`, `preload`, listeners de mídia, retry, proxy ou seek.

## Escopo técnico

- Arquivos criados temporariamente: `src/lib/dev/audioProbe.ts` e um carregamento condicional por query-string (removidos ao fim da auditoria).
- `src/components/whatsapp/AudioMessagePlayer.tsx`: **não é alterado**.
- Backend, banco, edge functions, storage e proxy: intocados.
