## Mover "Janela aberta · expira em..." para a segunda linha do header

### Problema
O chip `WhatsAppWindowChip` ("Janela aberta · expira em Xh Ym") está na linha do topo junto com SLA, status e Resolver, ocupando muito espaço horizontal e empurrando o nome do cliente para truncamento.

### Mudança (apenas `src/components/inbox/InboxThreadDetail.tsx`)

Reorganizar o header em duas linhas lógicas:

- **Linha 1 (topo):** avatar + nome do cliente (pode usar toda a largura disponível) + cluster compacto à direita com apenas: chip de status ("Aberta") + botão Resolver/Reabrir.
- **Linha 2 (abaixo do nome, junto dos badges "Cliente" / endpoint):** mover o `WhatsAppWindowChip` e o `InboxSlaChip` para essa linha secundária, alinhados à esquerda com os outros badges.

Resultado: nome ganha praticamente toda a largura do topo; informação de janela e SLA continuam visíveis logo abaixo, sem competir por espaço com o título.

### Fora de escopo
Nenhuma mudança em outros arquivos, lógica, dados ou no `WhatsAppWindowChip`/`InboxSlaChip` em si.

### Arquivo tocado
- `src/components/inbox/InboxThreadDetail.tsx`
