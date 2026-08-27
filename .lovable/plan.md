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

### Etapa T1 — Sonda de upload isolada (sem envio ao cliente)
Script local (não em produção) que, para um arquivo real que falhou:
- inspeciona o binário: tamanho, MIME declarado, MIME real, container, codec, sample rate, canais, duração (pergunta 3A);
- reproduz o `POST /{phone_number_id}/media` exatamente como o Edge faz (multipart, `messaging_product=whatsapp`, `type=<mime>`, filename), registrando URL, versão, campos, Content-Type do part e resposta completa sanitizada (3B);
- repete o upload variando **apenas** o valor do `type`/Content-Type do part: `audio/ogg` puro vs `audio/ogg; codecs=opus`, e com/sem extensão `.ogg` no filename.

Hipótese a testar aqui: o `details` cita `audio/ogg; codecs=opus`; se o parâmetro composto estiver atrapalhando o sniffing da Meta, o upload com `audio/ogg` puro passa.

### Etapa T2 — Envio controlado para número interno (perguntas 5 e 6)
Mesmo conteúdo de áudio, mesmo endpoint, para **um número interno de teste**, nas variantes:
- A: OGG/Opus como o produto gera hoje;
- B: OGG/Opus recodificado limpo por ffmpeg (`-c:a libopus -ar 48000 -ac 1`);
- C: MP3 `audio/mpeg`;
- D: M4A/AAC `audio/mp4` (opcional).

Cada variante roda nos **dois** phone_number_ids (`1248455741664884` e `1285032381352183`). Registro por teste: upload response, media_id, payload `/messages`, wamid, status final do webhook e `error_data.details`.

### Etapa T3 — Comparação com mídia que funciona (pergunta 4)
No mesmo endpoint e período, comparar o upload de um documento/imagem entregue com o do áudio que falhou, campo a campo, para localizar a etapa exata da divergência (o envio já usa `audio: { id }`, nunca link — confirmado em `meta-whatsapp-send/index.ts:928-943`).

### Etapa T4 — Saúde Meta (pergunta 8)
Chamar `meta-wa-diagnose` (read-only, já existe) para `quality_rating`, `status`, `messaging_limit_tier`, `throughput`, `account_review_status`, `business_verification_status` dos dois números e da WABA, procurando restrição de mídia.

## Classificação (pergunta 10) — parcial

Com a evidência atual já é possível **eliminar**: B (nosso payload está correto: `messaging_product`, `type`, `audio:{id}`, bytes por upload), C (dois phone_number_ids diferentes falham igual) e, salvo o que T4 mostrar, restrição de conta.

Restam **A** (algo no byte-stream que a Meta passou a não reconhecer) e **E** (regressão do processamento de mídia da Meta), com D possível se T4 apontar a WABA/App. A evidência temporal (zero mudanças nossas, arquivos estruturalmente idênticos antes e depois, virada abrupta em 26/08) pesa para **E**, mas T1/T2 são o que separa A de E: se o OGG recodificado limpo passar, é A; se nenhum OGG passar e MP3 passar, é E com contorno de formato; se nada de áudio passar, é D/E e vira caso de suporte Meta.

**Nenhuma correção definitiva será proposta antes de T1–T4.**

## Fora de escopo nesta etapa
Sem fallback, sem transcode em produção, sem mudança de roteamento, sem alteração no gravador, sem mudança de versão da Graph API, sem migração de schema. A persistência de `error_data.details` em `messages` fica como melhoria de observabilidade a decidir **depois** do fechamento.
