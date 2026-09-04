# Liberar áudio `audio/mp4` (AAC) no envio Meta

## Resposta curta
A trava pode ser ajustada. Ela não existe porque `audio/mp4` seja proibido pela Meta — existe porque o **navegador** produzia mp4 com codec **Opus** (saída do polyfill de gravação no desktop), que a Meta aceita no upload e depois rejeita com 131053. O comentário no próprio código diz isso: "audio/mp4 (que costuma vir com codec Opus)". Foi um bloqueio preventivo contra o caso do desktop, e acabou pegando o caso legítimo do celular.

## O que os dados mostram
- Áudio de saída nos últimos 120 dias: 40.324 entregues/lidos/enviados, todos com extensão diferente de `.m4a`.
- Só existem **2** tentativas com `.m4a` no período: uma de 07/07 que falhou com 131053 (originada do desktop, caminho `fallback_mp4` do gravador web, mp4/Opus) e a de ontem do app, que nem chegou à Meta — foi barrada pela nossa própria trava (status `sending`, sem erro registrado).
- Ou seja: **não há nenhum caso real de AAC dentro de .m4a rejeitado pela Meta** no nosso histórico. Não existe impedimento comprovado, nem restrição a "nota de voz com waveform" no nosso lado.

## Correção proposta (mínima)
No guard de áudio do envio Meta, trocar "bloqueia mp4" por "bloqueia mp4 que não seja AAC":

1. Adicionar `audio/mp4` (e `audio/m4a`, `audio/x-m4a`) à lista permitida.
2. Antes de liberar, **inspecionar os bytes** do arquivo já baixado: exigir caixa `ftyp` com brand de MP4/M4A e presença de trilha AAC (`mp4a`). Se o contêiner mp4 trouxer Opus (`Opus`/`dOps`), continua bloqueado — é exatamente o caso que gerava 131053.
3. Manter `audio/webm` bloqueado como hoje.
4. Registrar o resultado da checagem na telemetria de áudio (`audio_record_events`) com um evento novo, para medir a taxa de sucesso do formato do celular nas primeiras 48h.

Nada muda para OGG/Opus do web (sanitização atual permanece intacta), nem para AAC/MP3/AMR.

## Segunda correção, independente
O app hoje engole a resposta 415 do envio e deixa a mensagem eternamente com o relógio. Marcar a mensagem como falha e mostrar o motivo devolvido pelo servidor — isso vale para qualquer recusa futura, não só áudio.

## Detalhes técnicos
- Arquivo: `supabase/functions/meta-whatsapp-send/index.ts`, bloco `if (kind === "audio")` (linhas ~899-916). O guard roda depois do download do arquivo, então os bytes já estão em memória (`fileBytes`) — a inspeção de contêiner não adiciona nenhuma requisição.
- Sniffing: ler as primeiras caixas do MP4 (`ftyp`, e varredura curta por `mp4a` / `Opus`) num helper puro novo em `supabase/functions/_shared/meta-whatsapp/`, com testes de unidade cobrindo AAC-em-m4a (aceita), Opus-em-mp4 (rejeita) e arquivo truncado (rejeita, fail-closed).
- Rollout: a função precisa de deploy explícito (não sai por push). Validar com um envio real de `.m4a` do iOS para número interno e conferir o status final no webhook antes de liberar em produção.
- Documentar em `docs/operations/audio-telemetry.md` e no drift do dia.

## Fora de escopo
Sem transcodificação no servidor, sem biblioteca de conversão no app, sem mudança no gravador do web, sem alteração de roteamento ou de versão da Graph API.
