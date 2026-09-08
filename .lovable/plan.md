# Liberar áudio `audio/mp4` (AAC) no envio Meta — sem tocar no Web

## Resposta curta
A trava pode ser ajustada. Ela não existe porque `audio/mp4` seja proibido pela Meta — existe porque o **navegador** produzia mp4 com codec **Opus** (saída do polyfill de gravação no desktop), que a Meta aceita no upload e depois rejeita com 131053. O comentário no próprio código diz isso: "audio/mp4 (que costuma vir com codec Opus)". Foi um bloqueio preventivo contra o caso do desktop, e acabou pegando o caso legítimo do celular.

## O que os dados mostram
- Áudio de saída nos últimos 120 dias: 40.324 entregues/lidos/enviados, nenhum com extensão `.m4a`.
- Só existem **2** tentativas com `.m4a` no período: uma de 07/07 que falhou com 131053 (desktop, caminho `fallback_mp4` do gravador web, mp4/Opus) e a de 04/09 do app, que nem chegou à Meta — foi barrada pela nossa própria trava (status `sending`, sem erro registrado).
- Ou seja: **não há nenhum caso real de AAC dentro de .m4a rejeitado pela Meta** no nosso histórico. Não existe impedimento comprovado, nem restrição a "nota de voz com waveform" no nosso lado.

## Peça 1 — liberação de codec (isolada do Web)

### Garantia de não-regressão do Web
O caminho atual de `audio/ogg` / Opus fica **byte-por-byte inalterado**: mesma sanitização (`src/lib/sanitizeOggOpus.ts`), mesmo MIME, mesmo upload, mesmo fluxo. A nova lógica é um ramo novo que só é alcançado quando o MIME efetivo é MP4/M4A. Nenhuma linha compartilhada com o ramo OGG é reescrita; `audio/webm` continua bloqueado exatamente como hoje.

### Regra nova
1. MIMEs de entrada aceitos: `audio/mp4`, `audio/m4a`, `audio/x-m4a`. Ao subir para a Meta, os aliases M4A são **normalizados para `audio/mp4`** (um só valor sai da nossa borda).
2. A decisão é tomada pelo **conteúdo real**, nunca pela extensão nem pelo MIME informado pelo cliente.
3. **Parser mínimo de boxes MP4** sobre `fileBytes` (já em memória; limite de áudio da Meta é 16 MB, então varredura completa é segura): descer `ftyp` → `moov` → `trak` → `mdia` → `minf` → `stbl` → `stsd` e ler a sample entry, sem depender de o `moov` estar no início do arquivo (em gravação iOS ele frequentemente fica no fim).
   - sample entry `mp4a` → **liberar**;
   - `Opus` / `dOps` → **bloquear**;
   - arquivo truncado, tamanho de box inconsistente, `moov`/`stsd` ausente ou codec não identificado → **bloquear (fail-closed)**.
4. Telemetria: registrar o veredito em `audio_record_events` com um evento novo, para medir as primeiras 48h.

## Peça 2 — status travado em "enviando" (entrega separada)
Independente da peça 1 e sem acoplamento a áudio: qualquer resposta **definitiva** de recusa do envio (415 e demais recusas terminais) passa a marcar a mensagem como `failed`, persistir o motivo e exibi-lo na conversa, em vez de deixá-la eternamente com o relógio.

## Testes obrigatórios antes do deploy
| Caso | Esperado |
|---|---|
| M4A/AAC real gerado pelo app iOS | liberado |
| Arquivo real do Android (se o app suportar) | liberado |
| OGG/Opus real do Web atual | passa pelo caminho antigo, sem regressão |
| MP4 com Opus | bloqueado |
| Arquivo inválido/truncado | bloqueado |

Testes de unidade cobrem os cinco casos com fixtures reais; o parser é um helper puro testável.

## Validação em produção (rollout controlado, sem liberação ampla)
1. Deploy explícito da função (não sai por push).
2. Envio real **do app** para número interno; confirmar `sent`/`delivered` pelo webhook e reprodução no WhatsApp.
3. Em seguida, envio **Web OGG/Opus** e prova de que continua `sent`/`delivered`.
4. Só então discutir liberação ampla. Entrego o diff conceitual e os resultados dos dois envios antes de considerar concluído.

## Detalhes técnicos
- `supabase/functions/meta-whatsapp-send/index.ts`, bloco `if (kind === "audio")` (~899-916): a lista permitida ganha os MIMEs MP4/M4A, e apenas para esses MIMEs roda o parser + normalização. Demais MIMEs seguem o fluxo atual sem alteração.
- Parser novo em `supabase/functions/_shared/meta-whatsapp/` como módulo puro (sem I/O, sem dependência de Deno), com testes de unidade próprios.
- Documentar em `docs/operations/audio-telemetry.md` e no drift do dia.

## Fora de escopo
Sem transcodificação no servidor, sem biblioteca de conversão no app, sem mudança no gravador do web, sem alteração de roteamento ou de versão da Graph API, sem mexer em `audio/webm`.
