# Evolution API — Paridade de tipos de mensagem (vCard e mídias)

## Objetivo
Paridade do provider Evolution com o comportamento já existente da Meta Cloud API para tipos especiais, reutilizando ao máximo a infraestrutura atual e mantendo **zero regressão** em Meta, Twilio e demais tenants.

## Escopo desta entrega
Inclui: vCard inbound, múltiplos contatos, localização, live location, reply/quoted, fallbacks para tipos especiais, auditoria real de imagem/áudio/vídeo/documento/sticker.

**Não implementar outbound de vCard.** A UI atual não expõe ação de enviar contato. Se a Evolution suportar `/message/sendContact/{instance}`, apenas documentar no relatório.

## Passo 1 — Auditoria do contrato `metadata.meta_cloud.raw`
Grep completo no repo (`src/**`, `supabase/functions/**`, SQL, triggers) confirmando que o namespace é usado **apenas** como contrato visual pelos renderers (`MetaRichMessageContent` + consumidores). Verificar ausência em: identificação de provider, métricas, billing, automações, regras de negócio, auditoria, analytics.

- **Se contrato puramente visual:** reutilizar `metadata.meta_cloud.raw` diretamente no Evolution.
- **Se existir semântica de provider:** criar contrato neutro `metadata.rich_message` com mesmo shape `{ type, contacts, location, reaction }` e alterar o renderer para consumir na ordem `metadata.rich_message → fallback metadata.meta_cloud.raw`. Meta e Twilio permanecem intocados. Provider da mensagem continua determinado exclusivamente por `endpoint_id`, `communication_endpoints.provider` e `metadata.evolution` — nunca por `metadata.meta_cloud`.

Decisão documentada no relatório final.

## Passo 2 — vCard real
Capturar payloads reais da instância `dev-int` para `contactMessage` e `contactsArrayMessage`. Zero payload sintético. Redigir números no relatório.

Extrair: `FN`, `N`, `ORG`, `EMAIL`, múltiplos `TEL`, `TEL;waid=`. Preservar vCard original. Normalizar telefones com a mesma regra E.164/BR já usada no CRM.

Criar `supabase/functions/_shared/evolution/vcard.ts` centralizando o parser.

## Passo 3 — Parser
Expandir `supabase/functions/evolution-webhook/index.ts` para suportar:
- `contactMessage`, `contactsArrayMessage`
- `locationMessage`, `liveLocationMessage`
- `pollCreationMessage`
- `templateButtonReplyMessage`, `interactiveResponseMessage`
- `reactionMessage`, `stickerMessage`
- `viewOnceMessage`, `viewOnceMessageV2`, `viewOnceMessageV2Extension` (desembrulhar **antes** do parser principal)

Nunca cair em `[mensagem não suportada]` quando o tipo puder ser identificado.

## Passo 4 — Persistência
Continuar preservando `metadata.evolution.raw` íntegro. Adicionar a estrutura normalizada consumida pelo renderer compartilhado.

Contatos:
```json
{
  "type": "contacts",
  "contacts": [
    {
      "name": { "formatted_name": "...", "first_name": "...", "last_name": "..." },
      "phones": [{ "phone": "...", "wa_id": "...", "type": "CELL" }],
      "emails": [{ "email": "...", "type": "HOME" }]
    }
  ]
}
```

Localização:
```json
{
  "type": "location",
  "location": { "latitude": 0, "longitude": 0, "name": "...", "address": "..." }
}
```

Exatamente o contrato Meta.

## Passo 5 — Comportamento esperado
Ao compartilhar um contato real, nunca aparecer `[mensagem não suportada]`. Card deve mostrar nome, telefone, "Abrir contato" (quando existir) ou "Salvar contato" (quando não existir), idêntico ao Meta hoje. Não criar contato automaticamente pela vCard, salvo se já for regra global do CRM.

Mensagem deve: permanecer na thread histórica; aparecer em Mensagens e Atendimento; funcionar após refresh e cold start.

## Passo 6 — Múltiplos contatos
`contactsArrayMessage` renderiza todos os contatos via componente existente. Nenhum componente novo.

## Passo 7 — Localização
Location → renderer existente. LiveLocation → placeholder `[Localização ao vivo]` com payload bruto preservado.

## Passo 8 — Reply
Confirmar com testes reais: `quotedId` capturado, `reply_to_message_id` persistido, `QuotedMessage` renderiza, lookup por `whatsapp_message_sid`. Corrigir apenas se houver falha comprovada.

## Passo 9 — Auditoria de mídias
Testes reais para imagem, áudio, vídeo, documento e sticker (inbound e outbound). Validar: `media_type`, `media_urls`, MIME, filename, caption, duration (áudio), storage path, bucket, reload, cold start, render em Mensagens e em Atendimento. Corrigir apenas gaps comprovados. Sem refactor especulativo.

## Passo 10 — Outbound vCard
Não implementar. Se `/message/sendContact/{instance}` existir, documentar no relatório. Não alterar Composer, botão, dispatcher.

## Não regressão
Não alterar: Meta webhook, Twilio webhook, dispatcher, Composer, Inbox, regras de troca de endpoint, lógica de migração de thread, feature flags, demais tenants. Apenas Evolution é afetada.

## Testes obrigatórios (instância `dev-int`, tenant Viagi)
Para cada tipo registrar: Event ID, Message ID, Thread ID, tipo normalizado, metadata persistida, storage path, screenshot em Mensagens, screenshot em Atendimento.

Para vCard confirmar adicionalmente: webhook recebido, parser executado, mensagem persistida, metadata correta, renderer correto, reload funcionando, nenhuma thread nova criada, nenhum contato duplicado. Entrega não fecha sem essa validação.

## Arquivos previstos
Modificar apenas:
- `supabase/functions/evolution-webhook/index.ts`

Criar:
- `supabase/functions/_shared/evolution/vcard.ts`
- (opcional, somente se Passo 1 exigir contrato neutro) alteração no renderer compartilhado para aceitar `metadata.rich_message`

Nenhuma migration. Nenhuma alteração em Meta, Twilio ou telas (salvo a exceção acima).

## Entrega
`docs/integrations/evolution-api/MEDIA_AND_VCARD_AUDIT.md` contendo:
1. Payload real de `contactMessage` (redigido)
2. Payload real de `contactsArrayMessage` (redigido)
3. Decisão documentada sobre `metadata.meta_cloud.raw` vs `metadata.rich_message`
4. Parser implementado
5. Estrutura persistida
6. Evidências visuais em Mensagens
7. Evidências visuais em Atendimento
8. Matriz completa de tipos suportados
9. Event IDs
10. Message IDs
11. Thread IDs
12. Storage paths
13. Limitações restantes
14. Evidências de não-regressão

Não declarar concluído sem validar em produção piloto (Viagi).
