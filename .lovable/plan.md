## Diagnóstico

Ao gravar áudio na tela **Messages/Conversas**, o Meta rejeita `audio/webm` (só aceita `ogg/opus`, `mp4`, `aac`, `amr`, `mpeg`). O edge function `meta-whatsapp-send` devolve HTTP 500 com corpo:

```json
{"error":"meta_send_failed","details":{"code":100,"message":"(#100) Param file must be a file..."}}
```

O `dispatchWhatsAppSend` monta um `DirectFetchHttpError` e o propaga. No catch de `handleMediaUpload` (`src/pages/messages/MessagesList.tsx:1442-1451`), duas coisas usam `error.message` como **React child**:

1. `setMessages(... error_message: error.message ...)` → depois é passado para `<MessageStatusIndicator errorMessage={...} />`, que renderiza direto: `<span>...</span> {errorMessage}` (`src/components/whatsapp/MessageStatusIndicator.tsx:89`).
2. `toast({ description: error.message })`.

Em algum caminho (provavelmente quando o corpo do erro chega com shape aninhada — ex.: `body.details` sendo `{code, message}` — ou quando o fallback `supabase.functions.invoke` do dispatch retorna um `FunctionsHttpError` com `context.message` objeto), `error.message` acaba sendo o objeto `{code, message}`. Ao entrar como children do `<span>` do `MessageStatusIndicator`, React lança:

> Objects are not valid as a React child (found: object with keys {code, message})

O mesmo padrão existe nos catches de texto (linhas 1229, 1341) e no `handleAudioSend` / `handleAudioSendAsDocument`, e também em `WhatsAppChat.tsx` / `ContactMessages.tsx`.

Além do crash, há um **bug de mídia** separado: o navegador grava `audio/webm` mas o arquivo é enviado ao Meta como está. Mesmo com o crash resolvido, o envio continuaria falhando. Não é o que a pergunta pediu, mas fica registrado como próximo passo — a correção proposta abaixo mira só o crash.

## Escopo da correção (só o crash)

Frontend/presentation apenas. Sem mudança de business logic, sem edge function.

### 1. Helper de normalização

Criar `src/lib/errorMessage.ts` com `toErrorMessageString(err: unknown): string`:
- string → retorna direto
- objeto com `.message` string → retorna `.message`
- objeto com `.message` objeto e `.message.message` string → retorna esse aninhado
- objeto com `.error` string → retorna
- fallback → `JSON.stringify(err)` truncado, ou `"Erro desconhecido"`

### 2. Blindar o render do `MessageStatusIndicator`

Em `src/components/whatsapp/MessageStatusIndicator.tsx`, coagir `errorMessage` (e `errorCode`) para string antes de renderizar. Assim, mesmo que algum código antigo grave objeto em `messages.error_message`, o bubble não crasha.

### 3. Blindar catches que gravam em estado / toast

Nos catches abaixo, aplicar `toErrorMessageString(error)` antes de:
- passar para `toast({ description })`
- persistir em `error_message` do estado local `messages`

Arquivos:
- `src/pages/messages/MessagesList.tsx` — 3 catches (linhas ~1229, 1341, 1443) + `handleAudioSend`, `handleAudioSendAsDocument`
- `src/components/whatsapp/WhatsAppChat.tsx` — catches análogos
- `src/components/contacts/ContactMessages.tsx` — catches análogos

### 4. Nada mais

- Não altero `dispatchWhatsAppSend` (já tenta coagir para string; a mudança acima serve como cinto+suspensório).
- Não mexo no fluxo de gravação (`audio/webm` continua sendo o problema real do envio, mas está fora deste bug).
- Sem migration, sem edge function, sem novos endpoints.

## Verificação

- Reproduzir o cenário: gravar áudio numa thread Meta e clicar enviar. Meta ainda devolve 500 (esperado), mas: (a) sem tela branca, (b) toast destrutivo mostra texto legível, (c) bolha marcada como `failed` com mensagem string.
- Rodar typecheck.

## Fora do escopo (para conversa futura)

Converter/rejeitar `audio/webm` antes de subir para o storage e chamar o send do Meta — resolve o `meta_send_failed` de verdade. Só listado; não faz parte deste plano.