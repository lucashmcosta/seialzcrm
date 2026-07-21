# Evolution API — Auditoria de Mídias e vCard

Status: **em progresso (parser + renderer prontos, testes reais pendentes)**
Escopo: paridade funcional de tipos de mensagem entre Evolution API, Meta Cloud e Twilio, sem regressão nos providers já em produção.

## 1. Contrato de metadados

Para não acoplar semanticamente o Evolution ao namespace `metadata.meta_cloud`
(que hoje carrega regras de negócio de Templates, Billing e detecção de
provider), padronizamos um **contrato neutro** em `metadata.rich_message`.

```jsonc
{
  "rich_message": {
    "type": "contacts" | "location" | "live_location"
          | "reaction" | "sticker" | "poll" | "interactive_reply",

    "contacts": [{
      "name":   { "formatted_name": "Fulano", "first_name": "Fulano", "last_name": "" },
      "phones": [{ "phone": "+5511999999999", "wa_id": "5511999999999", "type": "CELL" }],
      "emails": [{ "email": "x@y.com", "type": "WORK" }],
      "org":    "Empresa",
      "vcard":  "BEGIN:VCARD..."
    }],

    "location":   { "latitude": -23.5, "longitude": -46.6, "name": "...", "address": "..." },
    "reaction":   { "emoji": "❤️", "message_id": "<sid>" },
    "interactive":{ "kind": "button_reply" | "list_reply" | "template_button_reply" | "interactive_response",
                    "selected": "texto exibido" },
    "poll":       { "name": "Pergunta", "options": ["A", "B"] }
  },

  "evolution": { /* payload original Baileys sob metadata.evolution.raw */ }
}
```

O renderer `MetaRichMessageContent` lê `metadata.rich_message` **primeiro**;
se ausente, faz fallback para `metadata.meta_cloud.raw` (comportamento
histórico Meta). Nenhum componente novo foi criado — reutilizamos
`ContactsCard`, `LocationCard`, `ReactionContent` e `FlowReplyCard`.

## 2. Tipos suportados (Evolution → Seialz)

| Tipo Baileys                     | Kind interno       | Rich message         | Placeholder textual                     |
| -------------------------------- | ------------------ | -------------------- | --------------------------------------- |
| `conversation` / `extendedText`  | texto              | —                    | (texto)                                 |
| `imageMessage`                   | media/image        | —                    | `[Imagem]` ou caption                   |
| `audioMessage`                   | media/audio        | —                    | `[Áudio]`                               |
| `videoMessage`                   | media/video        | —                    | `[Vídeo]` ou caption                    |
| `documentMessage` (+withCaption) | media/document     | —                    | filename ou `[Documento]`               |
| `stickerMessage`                 | media/sticker      | `sticker`            | `[Sticker]`                             |
| `reactionMessage`                | —                  | `reaction`           | `<emoji> (reação)`                      |
| `locationMessage`                | —                  | `location`           | `📍 Localização[: nome/endereço]`       |
| `liveLocationMessage`            | —                  | `live_location`      | `[Localização ao vivo]`                 |
| `contactMessage` (vCard)         | —                  | `contacts` (1 item)  | `[Contato compartilhado: Nome]`         |
| `contactsArrayMessage`           | —                  | `contacts` (N itens) | `[Contato compartilhado: Nome (+N)]`    |
| `buttonsResponseMessage`         | —                  | `interactive_reply`  | texto selecionado                       |
| `listResponseMessage`            | —                  | `interactive_reply`  | título selecionado                      |
| `templateButtonReplyMessage`     | —                  | `interactive_reply`  | texto selecionado                       |
| `interactiveResponseMessage`     | —                  | `interactive_reply`  | `[Resposta interativa]`                 |
| `pollCreationMessage`            | —                  | `poll`               | `[Enquete: Pergunta]`                   |

O `unwrapMessage` desembrulha `ephemeralMessage`, `viewOnceMessage`,
`viewOnceMessageV2`, `viewOnceMessageV2Extension` e
`documentWithCaptionMessage` (até 6 níveis) antes de identificar o tipo.

## 3. Parser vCard

`supabase/functions/_shared/evolution/vcard.ts` implementa:

- Line unfolding RFC 6350 (linhas dobradas com espaço).
- Parsing de propriedades com parâmetros (`TYPE=CELL`, `waid=...`).
- Suporte a `FN`, `N`, `TEL`, `EMAIL`, `ORG`.
- Normalização de telefone para display E.164 (`+<digits>`) e preservação
  do `wa_id` quando o Baileys fornece o parâmetro `waid`.
- Composição de `formatted_name` a partir de `N` quando `FN` está ausente.
- `normalizeBaileysContact(contactMessage)` → `RichContact | null`.
- `normalizeBaileysContactsArray(contactsArrayMessage)` → `RichContact[]`.

## 4. Zero regressão

- `metadata.meta_cloud` continua sendo escrito exclusivamente pelo pipeline
  Meta (`meta-whatsapp-webhook`), sem qualquer alteração feita nesta fase.
- Twilio permanece inalterado.
- O renderer só entra na branch de `rich_message` quando `type` está presente
  no objeto neutro; qualquer outro conteúdo de `metadata` cai no fallback
  histórico.
- Nenhum campo foi renomeado, removido ou alterado em `messages`,
  `evolution_instances` ou `communication_endpoints`.

## 5. Pendências (a executar após validação em produção)

1. Capturar payloads reais de `contactMessage`, `contactsArrayMessage`,
   `locationMessage` e `stickerMessage` na instância `dev-int` (Viagi) e
   anexar aqui, seção 6.
2. Auditar `storage.objects` do bucket de mídia para confirmar paths
   `<org>/evolution-inbound/<waMessageId>.<ext>` e mimes preservados.
3. Verificar no Atendimento (Inbox) e Mensagens (Comercial) que os cards
   renderizam corretamente para ambos providers no mesmo thread.
4. Considerar suporte a `pollUpdateMessage` (votos) em fase futura — hoje
   não há UI para exibir resultados de enquete.

## 6. Amostras reais

> _Pendente_. Preencher com JSON abreviado + screenshot da renderização
> após teste manual na instância piloto.
