# Atendimento: permitir vincular documento a oportunidades ganhas

## Causa
Na janela "Vincular como documento" do Atendimento, a lista de oportunidades mostra só as **abertas**. Por isso, quando o cliente só tem oportunidade **ganha**, aparece "Este contato não tem oportunidades".

## O que muda
- No Atendimento, a lista passa a mostrar as oportunidades **abertas e ganhas**. As perdidas continuam fora.
- O Comercial não muda.

## Detalhes técnicos
- `src/components/inbox/InboxConversationTimeline.tsx:120`: trocar `.eq('status', 'open')` por `.in('status', ['open', 'won'])` e mostrar as abertas primeiro.
- O `MessagesList.tsx`, que é o Comercial, não muda.
