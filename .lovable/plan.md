# Chat do App: nome clicável e não lidas

## 1. Nome do contato clicável (cabeçalho da conversa)
- O nome no topo da conversa vira link para a página do contato (`/contacts/:id`, mesma rota da tela de Contatos), na mesma aba.
- Só vira link se o contato foi encontrado na organização (a busca atual já é limitada à org pelas regras de acesso). Se não encontrado, mostra "Cliente"/nome sem link.
- Lista de conversas não muda: clicar continua abrindo a conversa.

## 2. Contador de não lidas
- Quando `conversation.read` responder com sucesso: zerar na hora o número da conversa na lista (atualização direta do cache da lista, nas abas Abertas/Resolvidas), e depois manter a revalidação normal.
- Falha na leitura: nada muda (continua best-effort).

## 3. Selo novo no menu "Chat do App"
- Mostrar no item do menu (desktop e mobile) a soma de não lidas da organização.
- Fonte: o último estado que o Seialz já guarda dos avisos do App (`client_portal_chat_events.unread_for_staff`), sem chamar o App a cada tela. Só aparece quando a função do Chat do App está ligada para a org.
- Atualiza: ao receber aviso do App (Realtime já existente na tela) e, após leitura bem-sucedida, a tela zera a linha local e o selo é recalculado na hora.
- [INCERTO] Se o App não reenviar aviso após a leitura, o valor guardado no Seialz ficaria antigo; por isso, após `conversation.read` OK, a ponte (`client-portal-staff-proxy`) zera `unread_for_staff` daquela conversa no registro da própria org. Se preferir não tocar na ponte, o selo zera só localmente até o próximo aviso.

## Fora do escopo
WhatsApp, Inbox, Comercial, banco de dados (sem migration).

## Detalhes técnicos
- `src/pages/inbox/ClientPortalChatPage.tsx`: `Link` no header usando `contacts.get(id)`; `qc.setQueriesData(['portal-chat','list'])` zerando `unreadForStaff`; invalidar `['portal-chat','menu-unread']`.
- Novo hook `useClientPortalUnreadCount` (select soma por org, staleTime curto) + badge em `src/components/Layout.tsx` nos dois pontos onde o item aparece.
- Proxy: no ramo `conversation.read`, update service-role `unread_for_staff = 0` filtrado por `organization_id` da sessão + `conversation_id`; republicar.
- Teste: função pura que zera o contador na lista em cache.
