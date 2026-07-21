## Diagnóstico confirmado

Comparei uma mensagem de documento outbound Meta (que renderiza) com as duas mensagens outbound backfilled da Marlisa (`[Documento] OAB kaik.pdf`, `[Documento] CNPJ REBIZZI.pdf`, thread Ralis, endpoint Evolution 8439).

### Bug 1 — Chip roxo "Marlisa Mano"

Origem: `MessagesList.tsx` linha 2212-2215 mostra `<Badge color="purple" icon={<Robot />}>{sender_name || 'Agente IA'}</Badge>` sempre que `sender_type === 'agent'` numa mensagem outbound.

- Outbound CRM Meta/Twilio: `sender_type = 'user'` (nenhum badge).
- Outbound Evolution device echo (novo e backfilled): `sender_type = 'agent'` → cai no badge de IA.

Fonte do defeito: `ingestOutboundEchoMessage` em `supabase/functions/evolution-webhook/index.ts` linha 1284 grava `sender_type: "agent"`. O backfill SQL replicou o mesmo valor. `evolution-whatsapp-send` (envio pelo CRM) usa `sender_type: 'user'` — é esse o contrato correto.

Correção: gravar `sender_type = 'user'` no echo. Preservar a informação de origem apenas em `metadata.evolution.origin='device'` (já existe). `sender_agent_id` fica `null` (já é o padrão).

### Bug 2 — Documento como texto puro

Renderer (`InboxConversationTimeline.tsx` linhas 43-77 e `WhatsAppChat.tsx`) só desenha o card "Ver documento" quando `msg.media_urls` tem pelo menos 1 URL. Se `media_urls` está vazio, o `<Media>` retorna `null` e o texto `[Documento] X.pdf` cai no bloco de conteúdo normal.

Estado real das duas linhas backfilled:
- `media_type = 'document'` ✓
- `media_urls = []` ✗ (vazio — SQL de backfill não baixou mídia)
- `metadata.evolution.file_name`, `mime_type`, `storage_path` = ausentes
- `content = '[Documento] OAB kaik.pdf'`

Contrato mínimo que o renderer exige: `media_type = 'document'` + `media_urls` com pelo menos 1 URL válida (o próprio código já detecta PDF por extensão ou por `media_type='document'` → fallback "Ver documento").

Além disso, o próprio `ingestOutboundEchoMessage` já monta o mesmo contrato do inbound (`media_urls = [publicUrl]`, `metadata.evolution.file_name/mime_type/storage_path`) — se o download Evolution funcionar, mensagens novas já nascem corretas. Não há mudança de contrato necessária no path novo; só a correção do `sender_type` acima.

Não existe estado "mídia indisponível" nos renderers atuais (`InboxConversationTimeline` e `WhatsAppChat`). Confirmado: os dois só têm dois caminhos — tem URL → card; não tem URL → nada. Vou reportar essa limitação sem inventar componente novo.

## Correções

### 1. `supabase/functions/evolution-webhook/index.ts`
- `ingestOutboundEchoMessage`: trocar `sender_type: "agent"` por `sender_type: "user"`.
- Nenhuma outra mudança de contrato (o path já popula media_urls, file_name, mime_type, storage_path quando o download funciona).
- Redeploy da função.

### 2. Backfill corretivo — chip roxo (idempotente, escopo estreito)

`UPDATE public.messages SET sender_type='user' WHERE organization_id IN (Viagi) AND endpoint_id = <Evolution 8439> AND direction='outbound' AND sender_type='agent' AND (metadata->'evolution'->>'origin') = 'device' AND sender_agent_id IS NULL;`

Impacto esperado: ~110 linhas (todas as backfilled + qualquer echo novo pré-fix). Não toca mensagens de IA reais (essas têm `sender_agent_id` populado).

### 3. Backfill corretivo — documentos

Alvo estrito: linhas com `organization_id ∈ Viagi`, `endpoint_id = Evolution 8439`, `direction='outbound'`, `origin='device'`, `media_type='document'`, `media_urls` vazio/null, sem duplicata por `whatsapp_message_sid`. Contagem esperada: 2 linhas visíveis (OAB kaik.pdf, CNPJ REBIZZI.pdf) — confirmar total antes de escrever.

Para cada uma:
1. Ler `integration_inbound_events` da instância `dev-int` pelo `whatsapp_message_sid` e recuperar o payload `documentMessage` (mediaKey, directPath, url, mimetype, fileName).
2. Tentar `downloadEvolutionMedia` (endpoint `/chat/getBase64FromMediaMessage` da Evolution, mesmo que o `ingestOutboundEcho` usa).
3. **Se o download funcionar** (mídia ainda disponível):
   - Upload no bucket `whatsapp-media` em `<org>/evolution-inbound/<wamid>.<ext>` (mesmo prefixo do inbound, conforme o path novo já faz).
   - `UPDATE messages SET media_urls = ARRAY[publicUrl], metadata = jsonb_set(metadata,'{evolution}', metadata->'evolution' || jsonb_build_object('file_name', fileName, 'mime_type', mime, 'storage_path', path))` só naquela linha.
   - Renderer volta a mostrar "Ver documento" com o filename real (via `content` já existente).
4. **Se o download falhar** (mídia expirada):
   - Não alterar essa linha. `media_urls` continua vazio, renderer continua mostrando o texto `[Documento] OAB kaik.pdf`.
   - Reportar quantas ficaram sem recuperação e explicar a limitação (renderers atuais não têm estado "mídia indisponível"; introduzir esse estado seria feature nova, fora do escopo).

Execução via Edge Function pontual `evolution-doc-backfill` (efêmera; excluída após rodar), porque precisa falar com a Evolution API. Não migração, não cron, não feature flag.

### 4. Validação em produção (piloto Viagi, thread da Ralis)

1. Antes: `SELECT id, sender_type, media_type, media_urls FROM messages WHERE id IN ('43810741...','a16d0dbd...')` — snapshot.
2. Rodar backfill.
3. Depois: mesmas duas linhas com `sender_type='user'`, `media_urls` com URL do storage (se recuperado).
4. F5 na thread → card "Ver documento" nas duas mensagens de PDF (ou pelo menos naquelas com download bem-sucedido).
5. Chip roxo "Marlisa Mano" desaparece de todas as mensagens da Marlisa na Ralis e nas outras threads afetadas.
6. Marlisa envia **novo** PDF pelo celular → chega já sem chip e com card "Ver documento" na primeira renderização (path novo já correto após a mudança do `sender_type`).
7. Repetir a checagem em `/atendimento` (mesmo renderer com nuances) confirmando os dois pontos.

## Fora de escopo

- Componente/estado "mídia indisponível" nos renderers (feature nova).
- Backfill de mensagens que não sejam documentos ou que não sejam device echo Viagi.
- Alteração em Meta/Twilio ou em `evolution-whatsapp-send`.
