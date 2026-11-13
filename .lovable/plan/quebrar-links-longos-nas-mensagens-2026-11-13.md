# Quebrar links longos nas mensagens

## Problema
Quando o cliente manda um link muito grande (ex.: DocuSign), o balão da mensagem estica além da tela. Isso empurra a conversa para o lado e as mensagens da Talita (que ficam à direita) saem da área visível.

## Correção
- Fazer o texto das mensagens quebrar em qualquer ponto quando não houver espaço (links longos passam a ocupar várias linhas dentro do balão).
- Garantir que o balão nunca ultrapasse a largura máxima da conversa.

Vale para Comercial, Atendimento e ficha do contato, pois todos usam o mesmo componente de texto. Nenhuma mensagem ou dado é alterado.

## Detalhes técnicos
- `src/components/whatsapp/WhatsAppFormattedText.tsx`: adicionar `[overflow-wrap:anywhere] min-w-0` (o `break-words` atual não quebra em contêiner flex dimensionado pelo conteúdo — mesmo padrão já usado em `TemplateMessageCard`/`InteractiveMessageCard`).
- Conferir o contêiner do balão em `WhatsAppChat.tsx` / `InboxConversationTimeline.tsx` e adicionar `min-w-0` e `max-w-[...]` onde faltar.
- Verificar com Playwright abrindo a conversa do Henrique.
