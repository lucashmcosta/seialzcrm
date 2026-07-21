## Objetivo

Permitir digitar mensagem livre em `/messages` mesmo com a "janela 24h" fechada, quando a thread vai sair pela Evolution API (número `+5511936198439`, `dev-int`) — que não tem restrição de template.

## Onde mora o bloqueio

`src/pages/messages/MessagesList.tsx` linha 2247:

```ts
const outOfWindow = !serviceWindow.isOpen && messages.length > 0;
```

Quando `outOfWindow=true` o composer troca o textarea por `WhatsAppTemplateSelector`, desabilita send/AI e mostra "Fora da janela — selecione um template".

`serviceWindow` vem de `useServiceWindow` (janela oficial WhatsApp Meta/Twilio, correta para provedores oficiais).

## Proposta (mínima, escondida, sem mexer em regra de negócio)

1. **Detectar provider do endpoint de envio** da thread:
   - `useThreadSendEndpoint` já existe e devolve o endpoint efetivo (com re-rota). Ler `provider` dele.
   - Chamar de "override permitido" quando `provider === 'evolution_api'`.

2. **Botão minúsculo escondido** no composer, renderizado só quando `outOfWindow && overrideAllowed`:
   - Aparece como um linkzinho de 10px (ex.: um ícone `Lock`/`LockOpen` + texto "Digitar sem template") na barra do placeholder "Fora da janela", ao lado do seletor de template.
   - Ao clicar: seta estado local `bypassWindow=true` (não persiste, escopo do thread aberto — reseta ao trocar de thread).

3. **Aplicar bypass**:
   - `const outOfWindow = !serviceWindow.isOpen && messages.length > 0 && !bypassWindow;`
   - Nada mais muda — textarea/AI/send voltam a funcionar normalmente.
   - `dispatchWhatsAppSend` já roteia por endpoint ativo, então o envio sai pela Evolution sem regra adicional.

4. **Reset**: `useEffect` zera `bypassWindow` quando `selectedThreadId` muda.

5. **Guarda de segurança**: se `overrideAllowed` for false (Meta/Twilio), o botão nem aparece — não é possível burlar janela em provedor oficial (evita erro 63016 e degradação de qualidade do número).

## Escopo do que NÃO muda

- `useServiceWindow`, `WhatsAppWindowChip`, `serviceWindow.reason`, RPCs, dispatcher, edge functions, mobile (`MobileMessagesList`), Inbox composer, contact drawer.
- Regras de compliance (`complianceGuards`) permanecem intactas.
- Nenhum backend/migration.

## Arquivos afetados

- `src/pages/messages/MessagesList.tsx` — estado `bypassWindow`, leitura de `provider` do send endpoint, botão discreto, ajuste da constante `outOfWindow`.

Uma única mudança de UI, ~30 linhas.