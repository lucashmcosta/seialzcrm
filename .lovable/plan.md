## Mudança

No `InboxThreadDetail.tsx` (painel direito do /inbox):

1. **Nome do contato** (header da conversa, linha 165) — envolver o `<h2>` em `<Link to={`/contacts/${thread.contact_id}`}>` com hover sublinhado, mantendo o estilo atual. Só renderiza como link se `thread.contact_id` existir.

2. **Origem · Oportunidade** (painel lateral, linha 256-258) — quando `latestWonOpportunity` existir, envolver o texto `Oportunidade · {title}` num `<Link to={`/opportunities/${latestWonOpportunity.id}`}>` com hover (text-primary underline).

Mudança puramente de apresentação — sem alterar dados, hooks ou lógica. Usa `react-router-dom` `Link` (já usado no projeto).
