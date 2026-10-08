# Nova Conversa: ícone "+" e busca só ao digitar

## O que muda
1. Botão "Nova Conversa" na tela de Mensagens (Comercial): ícone trocado por `Plus` (Phosphor, light).
2. Modal "Nova Conversa": ao abrir, não lista contatos. Mostra "Digite um nome ou número para buscar". A busca começa ao digitar (mínimo 2 caracteres, com espera de ~300 ms entre teclas para não consultar a cada letra).
3. Quando o modal é aberto já com um contato definido (a partir da ficha do contato), continua carregando esse contato direto, como hoje.

## Detalhes técnicos
- `src/pages/messages/MessagesList.tsx` (~linha 1982): trocar o ícone do botão.
- `src/components/messages/NewConversationDialog.tsx`: `useQuery` com `enabled: open && org && (initialContactId || debouncedSearch.length >= 2)`; estado vazio novo quando não há busca. Frontend apenas; mesmo modal vale também para o Atendimento.
