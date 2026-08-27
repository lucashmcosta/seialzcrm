# Erro 131053 em áudio Meta — diagnóstico aprofundado

## Achado principal (novo, e ele muda a leitura do caso)

O `error_data.details` da Meta **existe** e está guardado em `integration_inbound_events.raw_payload` (não em `messages`). Conteúdo exato, idêntico nas 4 falhas mais recentes de **ambos** os endpoints:

```text
"errors": [{"code": 131053, "title": "Media upload error", "message": "Media upload error",
  "error_data": {"details": "Audio file uploaded with mimetype as audio/ogg; codecs=opus, however on processing it is of type application/octet-stream. Please choose a different file."}}]
```

Ou seja: a Meta aceita o upload, declara ter recebido `audio/ogg; codecs=opus`, mas ao **processar o conteúdo** classifica o arquivo como `application/octet-stream` e rejeita. Não é MIME não suportado, não é rate limit, não é media fetch, não é restrição de conta.

## Respostas às perguntas 1, 2, 7, 9 (já fechadas com dados)

**1. Endpoints Meta com áudio nas últimas 36h (org Central `40ae935c…`)**

| endpoint_id | external_address | phone_number_id usado no envio | purpose | total | delivered/read | failed | codes | 1ª falha | último OK |
|---|---|---|---|---|---|---|---|---|---|
| `bf04ce63…` | +55 11 5028-7067 | `1248455741664884` | commercial | 659 | 570 | 43 | 131053, 131047 | 26/08 14:32 UTC | 26/08 21:44 UTC |
| `c09bd713…` | +55 11 5028-7027 | `1285032381352183` | customer_service | 1 | 0 | 1 | 131053 | 27/08 19:53 UTC | — |

Confirmado: **dois phone_number_ids Meta distintos**, mesmo `error_data.details`. O 7027 (Atendimento) tem volume baixíssimo de áudio (1 tentativa no período), então serve como confirmação qualitativa, não estatística. Nenhum endpoint Meta escapou; Evolution não passa pela Graph API.

**2.** `messages.error_code`/`error_message` só guardam `131053` / "Media upload error". O `details` está no `raw_payload` dos eventos `status:failed` — evidência acima. O webhook `meta-whatsapp-webhook` hoje **não** persiste `error_data.details` em `messages` (nenhuma referência a `error_data` no arquivo).

**7. Graph API:** `META_WHATSAPP_GRAPH_VERSION` com default `v23.0` (`_shared/meta-whatsapp/graph.ts:5`). Sem mudança de versão no repositório.

**9. Regressão temporal:** `git log` entre 26/08 12:00 e 27/08 21:00 UTC não tem **nenhum** commit em `meta-whatsapp-send`, `_shared/meta-whatsapp`, gravador de áudio, upload de mídia ou normalização de MIME. Os únicos commits do dia 26/08 foram `.lovable/plan.md` e uma linha em `types.ts`. **Declaro explicitamente: não houve mudança nossa na janela da quebra.** O `mime_type` persistido é `audio/ogg` tanto nos 1.512 áudios entregues (22–26/08) quanto nos 50 que falharam.

## O que ainda falta para fechar a classificação (perguntas 3–6, 8)

Estas etapas exigem **enviar mensagens de teste** — por isso estão aqui e não foram executadas.

### T1 — Matriz controlada de upload **+ envio** (perguntas 3, 4, 5)

Nenhuma variante termina no `POST /media`: hoje o `/media` **já aceita e devolve `media_id`** exatamente nos casos que depois falham, então media_id não é sinal de sucesso. Cada variante roda o ciclo completo:

1. `POST /{phone_number_id}/media` (multipart igual ao Edge: `messaging_product=whatsapp`, `type`, `file`);
2. captura `media_id`;
3. `POST /{phone_number_id}/messages` com `audio: { id: media_id }` para **um número interno de teste**;
4. aguarda o status final no webhook;
5. captura `error_code` e `error_data.details`.

Matriz mínima, com o mesmo conteúdo de áudio (um arquivo real que falhou hoje):

| # | arquivo | filename | Content-Type do part | campo `type` |
|---|---|---|---|---|
| A | original atual | `.ogg` | `audio/ogg` | `audio/ogg` |
| B | original atual | `.ogg` | `audio/ogg; codecs=opus` | `audio/ogg; codecs=opus` |
| C | recodificado ffmpeg (`libopus`, 48 kHz, mono) | `.ogg` | `audio/ogg` | `audio/ogg` |
| D | MP3 | `.mp3` | `audio/mpeg` | `audio/mpeg` |
| E | M4A/AAC (opcional) | `.m4a` | `audio/mp4` | `audio/mp4` | 

E só entra se for confirmado como formato aceito no caminho de áudio da Cloud API; caso contrário é registrado como "não aplicável" em vez de gerar ruído.

A variante B existe para checar se o parâmetro composto é o que o produto realmente envia hoje: o `details` da Meta cita `audio/ogg; codecs=opus`, mas o `mime_type` persistido em `messages` é `audio/ogg` puro. O teste registra exatamente o que foi transmitido em cada caso, sem supor.

**T2 — mesma matriz nos dois números** (pergunta 6): toda variante roda pelo `1248455741664884` (7067) e pelo `1285032381352183` (7027), para o mesmo número interno de destino.

**Registro por tentativa** (resultados brutos, sem resumir): SHA-256 do arquivo, tamanho, saída de `ffprobe`, filename, Content-Type real do part, valor de `type`, resposta completa do `/media`, `media_id`, payload sanitizado do `/messages`, `wamid`, status final, `error_code`, `error_data.details`.

**T3 — mídia que funciona (pergunta 4)**: no mesmo endpoint, comparar campo a campo o upload de um documento/imagem entregue com o do áudio que falhou, para localizar a etapa exata da divergência. O envio já usa `audio: { id }`, nunca link (`meta-whatsapp-send/index.ts:928-943`).

**T4 — saúde Meta (pergunta 8), antes de fechar a classificação**: `meta-wa-diagnose` (read-only, já existe) para `quality_rating`, `status`, `messaging_limit_tier`, `throughput`, `account_review_status`, `business_verification_status` dos dois números e da WABA, procurando restrição de mídia.

## Classificação (pergunta 10) — aberta

**Nada é eliminado ainda — inclusive B (payload/upload do Seialz) permanece em aberto.** O `media_id` devolvido pelo `/media` não prova que nosso multipart está correto; a mensagem da Meta é compatível com regressão de sniffing, byte-stream/container, filename/extensão, Content-Type do part, campo `type` ou divergência entre MIME declarado e bytes recebidos. A leitura será feita pela matriz:

- original falha + OGG recodificado funciona → bytes/container gerados hoje (A);
- todo OGG falha + MP3 funciona nos dois pnids → regressão/incompatibilidade atual da Meta com OGG/Opus nesse caminho (E);
- todos os formatos falham → investigar WABA/App/Meta (D);
- comportamento diferente entre 7067 e 7027 → phone_number_id/configuração (C);
- mudar só MIME/filename resolve → multipart/payload nosso (B).

**Nenhuma mitigação será proposta antes de T1–T4 fecharem.**

## Como os testes serão executados

Uma Edge Function de diagnóstico temporária (`meta-audio-131053-probe`, autenticada por `service_role`) que **não** escreve em `messages`, `message_threads` ou `activities` e **não** toca em endpoints, rotas ou `active_endpoint_id`. Ela recebe bytes + `filename` + `type`/Content-Type do part e executa apenas `POST /media` e `POST /messages` (`audio:{id}`), devolvendo SHA-256, tamanho, resposta bruta do upload, `media_id`, payload e `wamid`. As variantes C/D/E são geradas por `ffmpeg` no sandbox, nunca em produção.

Destino dos testes: **+55 11 96429-8621** (número interno). Tentativas espaçadas alguns segundos, cada uma com tag única (`A-7067`, `B-7027`, …) para correlacionar o webhook. O status final e o `error_data.details` são lidos por `wamid` em `integration_inbound_events.raw_payload`. A função é removida ao fim da investigação.



## Fora de escopo nesta etapa
Sem fallback, sem transcode em produção, sem mudança de roteamento, sem alteração no gravador, sem mudança de versão da Graph API, sem migração de schema. A persistência de `error_data.details` em `messages` fica como melhoria de observabilidade a decidir **depois** do fechamento.
