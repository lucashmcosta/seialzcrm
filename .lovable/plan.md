## Plano

Tornar o nome do contato no header da conversa (em `/messages`) clicável, navegando para `/contacts/:id`.

### Mudança

**Arquivo:** `src/pages/messages/MessagesList.tsx` (linhas 1301-1303)

Trocar o `<span>` do nome por um `<Link to={`/contacts/${selectedThread.contact_id}`}>` (o `Link` do `react-router-dom` já está importado), mantendo `font-semibold text-foreground truncate` e adicionando `hover:text-primary hover:underline transition-colors` para deixar claro que é clicável.

### Fora do escopo

- Mobile (`MobileMessagesList`).
- Demais elementos do header.
