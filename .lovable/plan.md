## Objetivo

Cada usuário deve reabrir as telas com os mesmos filtros que aplicou da última vez (estágio, dono, tags, status, período, etc.). Apenas o texto da pesquisa NÃO é lembrado — sempre começa vazio. A persistência fica no navegador (localStorage), por usuário logado.

## Como vai funcionar

- Quando o usuário muda um filtro, o valor é salvo automaticamente no localStorage.
- Ao reabrir a tela (ou recarregar a página), os filtros são restaurados antes da primeira busca — não há "flash" de dados sem filtro.
- Cada usuário tem seu próprio conjunto salvo (chave inclui o ID do usuário), então trocar de conta no mesmo navegador não mistura filtros.
- Trocar de organização também isola os filtros (chave inclui org_id) para evitar mostrar dono/estágio que não existe na outra org.
- Botão "Limpar filtros" (onde já existe) também apaga o registro salvo.
- A pesquisa por texto continua sempre vazia ao entrar na tela.

## Telas cobertas

1. **Contatos** (`/contacts`) — estágio, dono, tags, ordenação, page size.
2. **Oportunidades / Kanban** (`/opportunities`) — pipeline, estágios selecionados, dono, tags, status (ganho/perdido/aberto).
3. **Tarefas** (`/tasks`) — status, tipo, dono, prioridade, data.
4. **Mensagens** (`/messages`) — caixa (atribuído a mim, não atribuído, todos), status, canal.
5. **Relatórios** (`/reports`) — período (preset + range customizado), vendedor.
6. **Marketing** (`/marketing` e subpáginas) — período, conta/conjunto/anúncio, status.

## Detalhes técnicos

- Criar hook `usePersistedFilters<T>(key, defaultValue)` em `src/hooks/usePersistedFilters.ts`:
  - Lê `localStorage` na inicialização (lazy initializer do `useState`) para evitar flash.
  - Faz `JSON.parse` com try/catch — se corrompido, usa default.
  - `useEffect` salva em `localStorage` quando o valor muda (debounce 200ms para sliders/inputs numéricos).
  - Chave final: `seialz:filters:v1:{userId}:{orgId}:{scope}` (ex: `seialz:filters:v1:abc:xyz:contacts`).
  - Pega `userId`/`orgId` via `useOrganization()`. Se ainda não carregou, retorna `defaultValue` e não persiste (evita escrever lixo).
- Refatorar cada página listada para trocar `useState` dos filtros pelo hook — exceto `searchTerm`, que continua `useState` puro.
- Para Relatórios, datas custom serializam como ISO strings; reidratar como `Date` no `parse`.
- Versão `v1` na chave permite invalidar tudo no futuro se o formato mudar.
- Sem mudanças de banco, sem RLS, sem edge functions.

## Fora do escopo

- Sincronização entre dispositivos (não foi pedido; usaria `saved_views` se um dia for necessário).
- Persistir o texto da pesquisa.
- Persistir colunas visíveis ou ordem do Kanban (somente filtros).

## Verificação

- Aplicar filtros em cada tela → recarregar (F5) → filtros voltam, pesquisa vazia.
- Sair e entrar com outro usuário no mesmo navegador → filtros do outro usuário não aparecem.
- Trocar de organização → filtros isolados.
- Clicar em "Limpar filtros" → estado e localStorage zerados.
