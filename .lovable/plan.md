## Problema

Na versão mobile (`MobileMessagesList.tsx`), as mensagens enviadas (outbound) não mostram **quem da equipe enviou**. Hoje só aparece um badge quando o remetente é o agente de IA (`sender_type === 'agent'`). Mensagens enviadas por usuários humanos da equipe aparecem sem identificação — o que confunde quando vários atendentes usam a mesma conversa.

## Solução

Adicionar uma pequena linha com o nome do remetente no topo das mensagens **outbound enviadas por usuários humanos** (`sender_type === 'user'` e `sender_name` presente).

### Detalhes visuais

- Texto pequeno (`text-[10px]`), peso `font-semibold`, cor sutil (ex.: `text-white/70` dentro da bolha verde escura), `mb-1`.
- Mostrar apenas em mensagens outbound do tipo `user` quando `sender_name` existir.
- Mensagens do agente continuam usando o badge roxo atual (sem mudanças).
- Mensagens inbound (do contato) não recebem nome — o nome do contato já está no header da conversa.

### Arquivo afetado

- `src/components/mobile/MobileMessagesList.tsx` — adicionar bloco condicional logo acima do badge do agente (linha ~911), renderizando o nome do usuário humano.

Sem mudanças em backend, hooks de dados ou layout. É puramente apresentação.
