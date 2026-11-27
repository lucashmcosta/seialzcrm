# Atendimento: vincular documento a oportunidades ganhas

## Causa
Na janela "Vincular como documento" do Atendimento, a lista de oportunidades traz só as **abertas**. Por isso, quando o cliente só tem oportunidade **ganha**, a janela diz "Este contato não tem oportunidades" e não deixa salvar.

## O que muda
- No Atendimento, as oportunidades **ganhas** passam a aparecer na lista **e podem ser escolhidas para vincular o documento**. O documento fica salvo na oportunidade ganha. As abertas aparecem primeiro e as perdidas continuam fora.
- Conferi que nada no sistema impede salvar documento em oportunidade ganha. A restrição era só essa lista.
- Atenção: ao vincular a uma oportunidade ganha, o envio automático de "documento pós-venda" para o Nammux, que já existe, será disparado normalmente.
- O Comercial não muda.

## Detalhes técnicos
- `src/components/inbox/InboxConversationTimeline.tsx:120`: trocar `.eq('status', 'open')` por `.in('status', ['open', 'won'])` e ordenar com as abertas primeiro.
- O gravador de documentos (`useEntityDocuments`) não filtra por status. Os triggers de `documents` não bloqueiam; `trg_emit_nammux_post_win_document` emite o evento para oportunidades ganhas.
- `MessagesList.tsx` (Comercial) fica igual.
