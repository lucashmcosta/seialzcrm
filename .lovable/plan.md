## Causa raiz

A mensagem de áudio enviada pela Tamires para o `arlison` (+559299626104) **nunca foi inserida** na tabela `messages` e **nunca chegou** a `meta-whatsapp-send` (zero logs, zero linha outbound no thread).

O motivo é uma diferença entre `/messages` e `/inbox`:

- `src/pages/messages/MessagesList.tsx` chama `dispatchWhatsAppSend({ ..., contactId: selectedThread.contact_id })`.
- `src/components/inbox/InboxComposer.tsx` (`invokeSend`, linha 218–240) **não envia `contactId`** — só manda `organizationId`, `threadId`, `userId`, `senderName`.

A função `meta-whatsapp-send` exige `contactId` logo no início:

```ts
if (!contactId) return jsonResponse(400, { error: "missing_contact" });
```

→ retorna 400 → o cliente vê exatamente `Edge Function returned a non-2xx status code` (como na print).

Por que só apareceu agora no áudio do `arlison`:
- Thread Meta Cloud (primary_endpoint_id = `407ff93d`, provider `meta_cloud_api`).
- Antes do guard, áudios nessa thread iam pro `twilio-whatsapp-send` (que aceita só `threadId`) e falhavam silenciosamente com 63007.
- Depois do guard, o roteamento foi corrigido para Meta Cloud, mas o `/inbox` continua mandando payload incompleto e a função Meta rejeita antes de qualquer insert.
- O texto "Olá boa tarde!" das 19:11 funcionou porque foi enviado pelo `/messages`, que passa `contactId`.

A função `twilio-whatsapp-send` tolera ausência de `contactId` (deriva pela thread), por isso o problema só ficou visível no novo caminho Meta.

## Correção proposta (1 arquivo, ~3 linhas)

**`src/components/inbox/InboxComposer.tsx`** — em `invokeSend` (linha 218), adicionar `contactId: thread!.contact_id ?? undefined` ao payload base, junto com `organizationId`/`threadId`. Nada mais muda.

```ts
const { data, error } = await dispatchWhatsAppSend({
  organizationId: thread!.organization_id || organization?.id,
  threadId: thread!.id,
  contactId: thread!.contact_id ?? undefined, // ← NOVO
  senderContext: 'inbox',
  userId: myId,
  senderName,
  ...payload,
});
```

## Fora de escopo

- Não mexer em `meta-whatsapp-send` (a exigência de `contactId` está correta; é o cliente que deve mandar).
- Não mexer em `twilio-whatsapp-send`, dispatcher, RLS, templates ou inbound.
- Não mexer em `/messages` (já passa `contactId` corretamente).

## Validação

1. Pedir à Tamires para reenviar o áudio na mesma thread `arlison` pelo `/inbox`.
2. Conferir em `messages` (thread do `+559299626104`) que aparece uma linha `outbound`, `media_type='audio'`, `whatsapp_status='sent'`, `metadata.meta_cloud.wamid` preenchido.
3. Conferir logs de `meta-whatsapp-send` mostrando o POST recebido (não havia nenhum antes).
4. Smoke test no `/messages` (Mara/Twilio + tcharlesmattos2/Meta) para garantir que nada quebrou.

## Risco

Praticamente zero — adiciona um campo opcional que ambas as funções aceitam.
