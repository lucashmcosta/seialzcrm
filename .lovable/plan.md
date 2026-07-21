## Contexto

O botão "digitar livre" existe (`MessagesList.tsx` linhas 2294–2303), mas só aparece quando o endpoint de envio **da própria thread** já é Evolution (`sendEp.provider === 'evolution_api'`). Na thread da MORENAH o envio sai pelo Meta Cloud 2890, então a condição é falsa e o botão não renderiza — mesmo a org tendo o número Evolution 8439 disponível.

Como o composer já suporta escolha de endpoint por thread (`composerEndpointByThread` / `composerEndpointId`) sem persistir na thread, dá pra unir as duas coisas: o botão passa a ser **"digitar livre pelo 8439"** e, ao clicar, troca o endpoint do composer pro Evolution + libera o bypass da janela 24h.

## O que muda (apenas UI/estado local, sem tocar backend/dispatcher)

1. **Novo cálculo do endpoint Evolution disponível na org**
   - Em `MessagesList.tsx`, derivar `evolutionEndpoint` a partir de `orgEndpoints` filtrando `provider === 'evolution_api'` e `is_active`. Preferência: mesmo `purpose` da thread; senão, primeiro ativo.

2. **Nova condição de exibição do botão**
   - Substituir `canBypassWindow = sendEp.provider === 'evolution_api'` por:
     - `composerIsEvolution` = provider do `composerEndpointId` é Evolution.
     - `canBypassWindow` = `composerIsEvolution || !!evolutionEndpoint`.
   - Assim o botão aparece na thread da MORENAH (Meta) porque a org tem o 8439.

3. **Ação do botão "digitar livre"**
   - Se `composerIsEvolution`: apenas `setBypassWindow(true)` (comportamento atual).
   - Se não: `setComposerEndpointId(evolutionEndpoint.id)` **e** `setBypassWindow(true)`. Isso já faz o `dispatchWhatsAppSend` sair pelo 8439 (o handler usa `composerEndpointId`).
   - Texto/tooltip do botão passa a mostrar o número Evolution alvo (ex.: "digitar livre pelo +55 11 93619-8439") pra deixar claro que a mensagem vai sair de outro número.

4. **Reset ao trocar de thread**
   - `bypassWindow` já reseta no `useEffect([selectedThreadId])`. Manter.
   - `composerEndpointByThread` é keyed por thread, então a troca fica escopada e não vaza pra outras conversas.

5. **Aviso visual mínimo**
   - Enquanto o composer estiver no modo bypass + endpoint trocado, mostrar um badge discreto acima do input tipo "Enviando por Evolution · +55 11 93619-8439" (usa `formatEndpointIdentity` que já existe). Sem alterar layout maior.

## O que **não** muda

- `dispatchWhatsAppSend`, `evolution-whatsapp-send`, `useThreadSendEndpoint`, RPCs, tabelas, triggers, `primary_endpoint_id` da thread. É estritamente UI/estado local do composer.
- Regras de janela 24h continuam iguais para envios via Meta/Twilio.
- Templates continuam disponíveis normalmente pra quem estiver em Meta.

## Riscos / bordas

- Só habilita bypass se existir Evolution endpoint ativo na org — orgs sem Evolution continuam com o comportamento atual (só template).
- O endpoint trocado é por-thread e não persiste no banco; próxima abertura volta ao padrão (Meta), evitando surpresa em envios futuros.
- A thread continua Meta no `primary_endpoint_id`; apenas essa mensagem sairá pela Evolution. Se você quiser depois "migrar" a thread pro 8439 de forma permanente, isso é outro passo (não incluído aqui).

## Arquivo tocado

- `src/pages/messages/MessagesList.tsx` (bloco do bypass, ~linhas 292–302 e 2283–2303, mais leitura de `orgEndpoints`).