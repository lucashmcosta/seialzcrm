## Bug confirmado

A conversa do Joao Teste está, sim, no endpoint **`+551150287020` (provider `meta_cloud_api`, "Central Trabalhista")** — confirmei direto no banco:

```
thread 5f77df99 → primary_endpoint 407ff93d
endpoint: provider='meta_cloud_api', external_address='+551150287020'
```

Mas o seletor está listando **50 templates Twilio**. Causa raiz: o filtro por provider (`useWhatsAppProvider` + prop `provider` no `WhatsAppTemplateSelector`) só foi ligado em **2 dos 5 pontos** que abrem o seletor.

### Onde está ligado (correto)
- `src/components/whatsapp/WhatsAppChat.tsx` — passa `provider={waProvider}`
- `src/components/inbox/InboxComposer.tsx` — passa `provider={templateSelectorProvider}`

### Onde NÃO está ligado (bug)
- `src/pages/messages/MessagesList.tsx:1552` — **esta é a tela do seu print** (`/messages`)
- `src/components/contacts/ContactMessages.tsx:801`
- `src/components/mobile/MobileMessagesList.tsx:850`

Sem a prop, o seletor cai no default legado (`provider IS NULL OR 'twilio'`) e mostra os 134 templates Twilio em qualquer thread, inclusive Meta Cloud.

## Correção

Ligar o `useWhatsAppProvider(threadId)` nos 3 call sites restantes e propagar a prop `provider` para o `WhatsAppTemplateSelector`. Nenhuma mudança em backend, sync, edge functions, schema ou no próprio seletor — só fiação de prop.

### Arquivos a editar

1. **`src/pages/messages/MessagesList.tsx`**
   - Importar `useWhatsAppProvider`.
   - No componente que renderiza o chat da thread selecionada, calcular `const waProvider = useWhatsAppProvider({ threadId: selectedThreadId })` (usar o mesmo id já disponível no contexto da thread aberta).
   - Passar `provider={waProvider === 'meta_cloud_api' ? 'meta_cloud_api' : undefined}` no `<WhatsAppTemplateSelector>` da linha 1552.

2. **`src/components/contacts/ContactMessages.tsx`**
   - Mesmo padrão, usando o `threadId` da conversa aberta no dialog. Aplicar no `<WhatsAppTemplateSelector>` da linha 801.

3. **`src/components/mobile/MobileMessagesList.tsx`**
   - Mesmo padrão na linha 850.

### Resultado esperado após o fix

Abrindo a conversa do Joao Teste em `/messages` (endpoint 7020 Meta Cloud):
- Selector consulta `whatsapp_templates` com `provider='meta_cloud_api'` e `status='approved'`.
- Como a WABA `2206490376764877` ainda tem 0 aprovados (`conscentimento` está `pending`), o painel mostra o empty state em vez dos 50 templates Twilio.
- Quando a Meta aprovar o template, ele aparecerá automaticamente após clicar "Sincronizar templates".

Threads Twilio (números 5098, 7067, 7027 etc.) continuam vendo os 134 templates Twilio normalmente — isolamento preservado.

### Fora de escopo

- Não mexer no `WhatsAppTemplateSelector`, nas edge functions, no schema ou no sync.
- Não criar cruzamento Twilio ↔ Meta (decisão já firmada).
- Não alterar empty state copy nesta etapa (posso adicionar um aviso "Esta conversa é Meta Cloud / Twilio" depois, se você quiser).
