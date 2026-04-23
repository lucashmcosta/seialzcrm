

## Filtro de Ativos / Inativos na lista de Usuários

### Onde
`src/components/settings/UsersSettings.tsx` — aba "Usuários" (a mesma onde já existe a tabela com avatar/email/perfil/status).

### Comportamento
Adicionar um controle de filtro no topo da lista (ao lado do botão "Adicionar usuário"/"Convidar"), com 3 opções:

- **Todos** (padrão)
- **Ativos**
- **Inativos**

UI: usar o `TabGroup` que já existe em `src/components/common/TabGroup.tsx` (mesmo padrão visual usado em outras telas — Tarefas, Contatos), ou um `<Select>` compacto se o espaço estiver apertado. Decisão final: **TabGroup horizontal** acima da tabela, alinhado à esquerda; mantém o "Adicionar usuário" alinhado à direita.

### Lógica
- Novo state local `statusFilter: 'all' | 'active' | 'inactive'` (default `'all'`)
- A lista de membros já vem com `is_active` no objeto. Filtrar **no client** antes do `.map()` da tabela:
  - `all` → mostra todos
  - `active` → `members.filter(m => m.is_active)`
  - `inactive` → `members.filter(m => !m.is_active)`
- Sem mudança de query no Supabase (volume de membros por org é pequeno, filtro client-side é mais responsivo).
- Contador no título do card: "Membros (X)" passa a refletir o total filtrado, com o total geral entre parênteses se diferente. Ex: `Membros (3 de 8)`.

### Convites pendentes
A seção de convites pendentes (que aparece logo abaixo, se existir) **não é afetada** pelo filtro — é um bloco separado e o filtro é só pra usuários ativos/inativos da org.

### Estado vazio
Se o filtro retornar 0 resultados, mostrar dentro do card uma linha discreta tipo "Nenhum usuário inativo" / "Nenhum usuário ativo" (mesmo estilo do empty state já existente quando não há membros).

### Persistência
Não persistir entre sessões — filtro é volátil (state local). Se o usuário sair e voltar, volta pra "Todos".

### Fora do escopo
- Filtros adicionais (por perfil de permissão, por data de criação) — não pediu
- Busca por nome/email — não pediu
- Mudar query backend — desnecessário pro volume atual

