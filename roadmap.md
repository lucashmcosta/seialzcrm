# Roadmap

## Áudio Meta — `audio/mp4` (AAC) do celular
- [x] Parser mínimo de boxes MP4 (`_shared/meta-whatsapp/mp4-audio-codec.ts`): `mp4a` aceita, `Opus`/`dOps` bloqueia, truncado/desconhecido fail-closed.
- [x] Guard de áudio em `meta-whatsapp-send`: ramo exclusivo MP4/M4A, normalização de aliases para `audio/mp4`, caminho OGG/Opus do Web intacto.
- [x] Testes de unidade (13 casos) + validação com arquivos reais gerados por ffmpeg (AAC faststart on/off, MP4/Opus, OGG, truncado).
- [ ] Teste real: envio do app iOS (M4A/AAC) → `sent`/`delivered` no webhook + reprodução no WhatsApp.
- [ ] Teste de não-regressão real: envio Web OGG/Opus → `sent`/`delivered` + reprodução.

## Peça 2 (separada, não bloqueia a Peça 1)
- [ ] Recusas terminais do envio (415 e afins) marcam a mensagem como `failed`, persistem e exibem o motivo, em vez de deixar em `sending`.

## Mobile — mídia
- [ ] Enviar/exibir os 4 tipos (áudio, vídeo, documento, vCard) com paridade de regras com o Web.
- [ ] Decisão: envio de vCard (origem — contato do CRM vs agenda do aparelho).
