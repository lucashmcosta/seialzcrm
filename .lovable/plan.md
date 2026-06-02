## Plano: Busca de conversas no /inbox

Adicionar uma barra de pesquisa no topo da lista de conversas do Atendimento (/inbox), logo abaixo do header "Conversas".

### Escopo
- Apenas frontend, filtro client-side sobre `threads` já carregadas.
- Sem mudanças em backend, RPC ou realtime.
- Não afeta /messages.

### Implementação
Arquivo: `src/components/inbox/InboxThreadList.tsx`

1. Adicionar estado local `search` (string).
2. Renderizar `<SearchBar>` (de `@/components/common/SearchBar`) abaixo do header "Conversas", com placeholder "Buscar conversa...".
3. Filtrar `threads` por:
   - `contact.name` (case-insensitive)
   - `contact.phone`
   - `last_message_content`
4. Contador no header passa a refletir a quantidade filtrada (ex.: `filtered.length`).
5. Mensagem de vazio adaptada: "Nenhuma conversa encontrada." quando há busca ativa sem resultados.

### Não fazer
- Não alterar `useInboxThreads` nem queries.
- Não tocar em /messages.
- Não adicionar busca server-side (não necessário para o volume atual da lista carregada).

### Validação
- Digitar nome filtra a lista.
- Limpar busca restaura a lista completa.
- Selecionar conversa filtrada continua funcionando.
- /messages permanece inalterado.