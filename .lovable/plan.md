# Áudio que não reproduz na conversa — causa e correção mínima

## Diagnóstico (read-only, já confirmado)

O áudio da bolha com erro é a mensagem `2046cdbd-b3c1-45d8-a3c3-34af2b421a5d` (thread `7b3c0f3c-81fe-4dd7-b428-77b716019fdd`, inbound Meta Cloud, 03/09/2026 11:41).

Dados verificados:

- Arquivo no Storage responde HTTP 200, `content-type: audio/amr`, 7.559.014 bytes, `accept-ranges: bytes` — ou seja, não é URL expirada, não é permissão, não é upload corrompido.
- `ffprobe` do arquivo: container **AMR** (assinatura `#!AMR`), codec **amr_nb**, 8000 Hz, mono, duração 21:30.
- Metadados do webhook: `mime_type: audio/amr`, `voice: false` — não é áudio gravado no WhatsApp (que vem sempre em `audio/ogg; codecs=opus`), é um arquivo AMR anexado/encaminhado pelo contato.

Causa raiz: **nenhum navegador (Chrome, Safari, Firefox) decodifica AMR-NB.** O `<audio>` dispara `error` na hora do play, o player marca `hasError` e mostra "Não foi possível carregar este áudio.". O arquivo está íntegro; só é ilegível no browser.

Escala do problema: em 69.418 mensagens de áudio históricas, apenas **3** são `.amr` (o mesmo remetente reenviou o mesmo arquivo, sha256 idêntico em 27/07 e 03/09). Todo o resto é OGG/Opus, que toca normalmente.

## Correção proposta (mínima, só apresentação)

Como é caso raríssimo e o arquivo é válido, não vale criar pipeline de transcodificação. A correção é deixar claro ao atendente o que aconteceu e dar saída imediata:

1. Em `AudioMessagePlayer.tsx`, detectar formatos que o navegador declara não suportar (`audio.canPlayType`) a partir da extensão/URL — hoje o único caso real é `.amr`.
2. Nesses casos, trocar a mensagem genérica por: "Formato de áudio não suportado pelo navegador (AMR). Baixe o arquivo para ouvir." mantendo o link "Baixar áudio" já existente e removendo o "Tentar novamente" (que nunca vai funcionar para esse formato).
3. Não mexer em `src`, `preload`, listeners, retry, seek, proxy ou telemetria; nenhuma mudança de banco, RLS, edge function ou storage.

## Alternativa (não recomendada agora)

Transcodificar AMR → OGG/Opus no ingest do webhook Meta exigiria ffmpeg/wasm em edge function, custo e risco desproporcionais para 3 mensagens em 69 mil. Fica registrado como opção futura caso o volume de AMR cresça.

## Escopo técnico

- Alterado: `src/components/whatsapp/AudioMessagePlayer.tsx` (apenas a ramificação de erro e a detecção de suporte).
- Intocados: backend, banco, edge functions, storage, `MessagesList`, Inbox timeline.
