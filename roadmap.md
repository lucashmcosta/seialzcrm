# Roadmap

## Áudio Meta — `audio/mp4` (AAC) do celular
- [x] Parser mínimo de boxes MP4 (`_shared/meta-whatsapp/mp4-audio-codec.ts`): `mp4a` aceita, `Opus`/`dOps` bloqueia, truncado/desconhecido fail-closed.
- [x] Guard de áudio em `meta-whatsapp-send`: ramo exclusivo MP4/M4A, normalização de aliases para `audio/mp4`, caminho OGG/Opus do Web intacto.
- [x] Testes de unidade (13 casos) + validação com arquivos reais gerados por ffmpeg (AAC faststart on/off, MP4/Opus, OGG, truncado).
- [x] Teste real: áudio M4A/AAC do app iOS enviado como `audio/mp4` → `delivered` (msg f78e516d, wamid C7D1EF8A06A19030 03).
- [x] Teste de não-regressão real: OGG/Opus do Web → `delivered` (msg 6d03cd17), MIME enviado segue `audio/ogg`.

## Peça 2 (separada, não bloqueia a Peça 1)
- [x] `finishTerminal` em `meta-whatsapp-send`: recusas terminais (415 do guard de áudio) marcam `failed` + motivo persistido; `catch` da Graph reusa o helper com semântica idêntica.
- [x] Validação em produção: recusa terminal (msg 3e70f72a) → `failed` + motivo persistido; M4A/AAC válido (5d6c3092) → `delivered`; Web OGG/Opus (09701b11) → `delivered`.

## Mobile — mídia
- [ ] Enviar/exibir os 4 tipos (áudio, vídeo, documento, vCard) com paridade de regras com o Web.
- [ ] Decisão: envio de vCard (origem — contato do CRM vs agenda do aparelho).
