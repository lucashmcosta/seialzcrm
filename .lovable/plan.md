# Publicar a correção do áudio 131053 e validar em produção

A falha de 21:34:54 UTC no 7067 fica descartada como evidência: foi produção rodando o código antigo. Nenhuma investigação nova.

## 1. Estado do preview (verificado agora, read-only)

- `src/lib/sanitizeOggOpus.ts` existe, exporta `sanitizeOggOpusBlob` e `isSendableOggOpus`.
- `AudioRecorder.tsx:277` chama `sanitizeOggOpusBlob(blob)` no `onstop`, antes de `setAudioBlob`; validação de envio delega a `isSendableOggOpus` (linha 146).
- Telemetria nova: `audio_record_ogg_tail_fixed` e `audio_record_ogg_structure_invalid` declarados em `src/lib/audioTelemetry.ts` e emitidos no recorder.
- Testes: `tests/sanitize-ogg-opus.test.ts` — 13/13 passando.
- Build: sem erros no log de build.

## 2. Publicar

Publicar exatamente esta versão do preview em produção. Nenhuma alteração de código antes ou depois do deploy.

## 3. Validação em produção (após o deploy)

Gravar áudio NOVO diretamente em produção (não reaproveitar gravação anterior) e enviar:

- um envio pelo 7067 (Meta);
- um envio pelo 7027 (Meta).

Para cada envio, registrar, via consulta read-only:

| campo | origem |
|---|---|
| timestamp | `messages.created_at` |
| message_id | `messages.id` |
| wamid | `messages.provider_message_id` |
| evento sanitizer | `audio_record_events` com `event = 'audio_record_ogg_tail_fixed'` na mesma janela |
| status final | `messages.status` |
| error_code / error_data.details | `messages.error_code`, `messages.error_data` |

Observação sobre janela: se o número estiver fora da janela de 24h, o erro esperado é 131047 (janela), não 131053 — nesse caso o teste de mídia conta como aprovado e o envio deve ser refeito dentro de uma conversa com inbound recente para obter `delivered/read`.

## 4. Critério de aceite

- áudio gerado após o deploy;
- evento `audio_record_ogg_tail_fixed` presente para a gravação;
- arquivo sem pacote OGG de comprimento zero (garantido por `isSendableOggOpus` antes do envio);
- status `delivered` ou `read`;
- zero ocorrências de 131053.

Se os dois números passarem: correção considerada concluída; segue apenas acompanhamento de `audio_record_events` e de `error_code = 131053` por 48h, sem mudanças de código.
