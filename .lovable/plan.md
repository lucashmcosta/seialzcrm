## Problema

Os filtros (Contatos, Oportunidades, Tarefas, Mensagens, Relatórios, Marketing) somem ao sair e voltar para a tela, mesmo com o `usePersistedFilters` em vigor.

## Causa raiz

No hook `src/hooks/usePersistedFilters.ts`, dois `useEffect` dependem de `[storageKey, ready]`:

1. **Hidratação**: lê `localStorage` e chama `setValue(valorSalvo)`.
2. **Persistência**: grava `JSON.stringify(value)` em `localStorage`.

Quando a organização termina de carregar (`ready` passa de `false` para `true`), os dois efeitos rodam no mesmo commit. O `setValue` do efeito 1 é assíncrono — só vale no próximo render. Então o efeito 2 roda com `value` ainda igual ao default (`'all'`, `''`, etc.) e sobrescreve a chave do localStorage com o default, apagando o que o usuário tinha salvo. Por isso o filtro "Lucas Costa" some ao reabrir Contatos.

## Correção

Adicionar um `skipNextSaveRef` no hook que sinaliza ao efeito de persistência para ignorar o primeiro disparo logo após a hidratação:

- Na hidratação: marca `skipNextSaveRef.current = true` antes do `setValue`.
- Na persistência: se `skipNextSaveRef.current` estiver `true`, limpa a flag e sai sem gravar. Nos disparos seguintes (quando o `value` muda de fato), grava normalmente.

Também tratar troca de organização: ao mudar `storageKey`, re-hidratar e re-armar a flag (mesma lógica, já coberta pela checagem `hydratedKeyRef.current !== storageKey`).

## Arquivos alterados

- `src/hooks/usePersistedFilters.ts` — adicionar `skipNextSaveRef` e proteger o efeito de persistência.

Nenhuma página precisa mudar — o fix é local ao hook e cobre todas as 6 telas (Contatos, Oportunidades, Tarefas, Mensagens, Relatórios, Marketing).

## Verificação

1. Abrir `/contacts`, selecionar dono "Lucas Costa", sair para `/opportunities`, voltar para `/contacts` → filtro continua "Lucas Costa".
2. Recarregar (F5) → filtro permanece.
3. Clicar "Limpar filtros" → estado e localStorage zerados.
4. Repetir nas outras telas (Oportunidades/Kanban, Tarefas, Mensagens, Relatórios, Marketing).
5. Inspecionar `localStorage` no DevTools: chaves `seialz:filters:v1:{userId}:{orgId}:{scope}` mantêm o último valor escolhido entre navegações.
