# Áudio falhando no 7067 (Meta) e funcionando no 7020 (Evolution)

## O que os dados mostram (verificado agora)

Escopo: endpoint `bf04ce63…` = +55 11 5028-7067, provider `meta_cloud_api`, phone_number_id `1248455741664884`, qualidade GREEN, ativo.

- Todo áudio **outbound** do 7067 desde **26/08 22:00 UTC (19:00 SP)** falhou: 14/14, e nas horas de hoje 100% `failed`.
- O erro registrado pelo webhook de status da Meta é sempre o mesmo: `error_code = 131053`, `error_message = "Media upload error"`. Primeira ocorrência 26/08 20:12 UTC, virou 100% a partir de 22:00 UTC.
- Antes disso o mesmo número entregava áudio normalmente (centenas de `read`/`delivered` até 26/08 21:44 UTC).
- **Documento e imagem continuam funcionando** no 7067 hoje (document `read` às 13:23 UTC). Ou seja, não é o pipeline de mídia inteiro — é só áudio.
- O 7020 não é comparável: hoje ele é `evolution_api` (Baileys), não passa pela API da Meta. O 7020 Meta antigo (`407ff93d…`) está inativo/removido da WABA.

Descartado por medição direta:

- **Arquivo/gravador**: baixei arquivos que falharam hoje e arquivos que foram entregues ontem. São byte-a-byte equivalentes em estrutura: OggS + OpusHead, Opus, 48 kHz, mono, 3–31 s, 17–200 KB. Cabeçalhos idênticos.
- **Gravador no navegador**: `audio_record_events` dos últimos 3 dias mostra 1.845 `audio_record_success` e apenas 4 `audio_record_invalid_ogg` (o último em 26/08 17:10, antes do corte).
- **Config/rota**: mesmo `phone_number_id` nos envios que funcionaram e nos que falham; nenhuma troca de integração ou de endpoint no período.
- **Rejeição no nosso código**: o guard de MIME (`unsupported_audio_mime`, HTTP 415) não está sendo acionado — o MIME registrado é `audio/ogg` e a Meta aceita o POST (retorna `wamid`). A falha é assíncrona, via webhook de status.

Conclusão até aqui: nosso lado envia exatamente o mesmo payload que funcionava; o `131053` está sendo produzido **depois** do aceite, no processamento de mídia de áudio da Meta para esse phone_number_id. **A causa raiz na Meta ainda não está confirmada** — é o que a Etapa 1 abaixo vai fechar antes de qualquer mudança de código.

## Etapa 1 — Confirmar a causa na Meta (diagnóstico, sem mexer no produto)

1. Reenviar, por script controlado, **um dos arquivos que falharam hoje** para um número interno de teste pelo 7067, registrando: resposta do upload `/media`, resposta do `/messages` e o status final do webhook. Isso separa "upload aceito mas mídia rejeitada" de "conteúdo rejeitado".
2. No mesmo teste, comparar três variações do mesmo áudio para isolar o gatilho:
   - o `.ogg/opus` atual como está;
   - o mesmo áudio reenviado com `type=audio/ogg` explícito no upload e no envio (igual hoje, como controle);
   - o mesmo áudio transcodificado para `audio/mpeg` (mp3) — se este entregar, a rejeição é específica de OGG/Opus nesse número.
3. Consultar via Graph a saúde do phone_number_id `1248455741664884` (status, throughput, restrições) e a WABA `46231cd1…`, procurando restrição recente de mídia.
4. Registrar o resultado em `docs/operations/audits/` com data e evidência.

## Etapa 2 — Mitigação (só após o resultado da Etapa 1)

Escolher **uma** conforme o que a Etapa 1 mostrar:

- **A. Fallback automático de formato**: se OGG/Opus estiver sendo rejeitado só nesse número, converter o áudio para o formato que a Etapa 1 provar aceito antes do upload, mantendo o envio como `type=audio` (nota de voz).
- **B. Falha visível + fallback manual**: manter OGG, mas quando o webhook devolver `131053` mostrar no chat a ação "reenviar como arquivo" (document), que hoje comprovadamente entrega nesse número.
- **C. Rota alternativa**: enviar áudio comercial pelo endpoint Evolution enquanto a Meta estiver rejeitando — troca de `active_endpoint_id` da linha comercial, sem mudança de código.

Se a Etapa 1 apontar restrição de conta, o caminho é abrir suporte com a Meta anexando os `wamid` que falharam; nesse caso nenhuma mudança de código resolve, e usamos B ou C como contorno.

## Fora de escopo

Nenhuma alteração em roteamento, gate canônico, resolver V2, gravador de áudio ou UI nesta etapa.

## Notas técnicas

- Envio: `supabase/functions/meta-whatsapp-send/index.ts` (upload em `_shared/meta-whatsapp/graph.ts → metaWaUploadMedia`, multipart com `messaging_product=whatsapp` e `type=<mime>`).
- Status/erro: `supabase/functions/meta-whatsapp-webhook/index.ts` grava `messages.error_code` / `error_message`.
- Evidência: `messages.error_code = '131053'`, 22 ocorrências, todas `media_type='audio'`, endpoint `bf04ce63…`.
