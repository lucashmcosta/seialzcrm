## Diagnóstico

As mensagens "[mensagem não suportada]" na thread da Alba são de dois tipos que o parser do `evolution-webhook` não trata:

1. **`secretEncryptedMessage` (secretEncType=2)** — payloads Signal-criptografados que o WhatsApp usa para votos de enquete e reações/edições em versões novas do app. Não são texto do cliente; o WhatsApp oficial não os exibe. Hoje caem no fallback `[mensagem não suportada]`.
2. **`contactsArrayMessage`** — vCards múltiplos. O handler **já existe** no código atual (`normalizeBaileysContactsArray`); a ocorrência isolada de ontem entrou antes do deploy desse handler. Não é regressão nova.

Confirmado via inspeção de `messages.metadata->'evolution'->'raw'` (últimas 24h: 2× `secretEncryptedMessage`, 1× `contactsArrayMessage`).

## Correção

Editar apenas `supabase/functions/evolution-webhook/index.ts` no parser `parseMessagesUpsert`:

1. Antes do fallback final `content = '[mensagem não suportada]'`, detectar `message.secretEncryptedMessage` (ou raiz da mensagem com apenas `messageContextInfo` + `secretEncryptedMessage`).
2. Nesse caso, **retornar `null` do parser** — o webhook descarta o evento silenciosamente, igual ao comportamento do WhatsApp oficial. Registrar `console.log('[evolution-webhook] secretEncrypted skipped', { secretEncType, remoteJid })` para auditoria.
3. Deploy da função.

Cleanup pontual das mensagens fantasmas já persistidas na thread da Alba (e demais das últimas 24h que casem exatamente com o mesmo padrão), via `DELETE` escopado:
- `content = '[mensagem não suportada]'`
- `metadata->'evolution'->'raw' ? 'secretEncryptedMessage'`
- `created_at > now() - interval '24 hours'`

## Não faz parte

- Não altera UI, dispatcher, `MetaRichMessageContent`, banco, RLS.
- Não toca Meta Cloud (esse tipo só vem via Baileys/Evolution).
- Não tenta decodificar Signal para exibir "reagiu 👍" — sem chaves, é inviável e o próprio WhatsApp oficial esconde esses eventos.
- Não reprocessa `contactsArrayMessage` antigo (handler já cobre novos envios); posso incluir no cleanup se pedir.

## Arquivos tocados

- `supabase/functions/evolution-webhook/index.ts` — bloco final do `parseMessagesUpsert` (~linhas 419–432).