# Padronizar modais de detalhe do /dashboards com o da Início

Objetivo: os modais abertos ao clicar nos cards de `/dashboards` (Criadas / Ganhas / Perdidas) passam a mostrar as mesmas informações do modal da tela Início.

## O que muda visualmente

Cada linha da lista passa a exibir, na ordem:

1. Nome do contato (negrito) — hoje mostra o título da oportunidade
2. Título da oportunidade (linha secundária)
3. Data + responsável, ex.: `Criada em 01/09/2026 · Responsável: Victoria Amorim` (rótulo "Responsável", também na tela Início)

Valor (R$) continua alinhado à direita. Rótulo de data para ganhas passa de "Fechada em" para "Ganha em", como na Início; perdidas mantém "Fechada em".

Se o contato não existir, exibe `(sem contato)`; sem responsável, exibe `—`.

## Detalhes técnicos

- Arquivo: `src/pages/reports/ReportsPage.tsx`
- Ampliar o `select` da busca on-demand do modal para incluir `contacts(full_name)` e `users!opportunities_owner_user_id_fkey(full_name)` (mesmos relacionamentos usados na Início), mantendo `.limit(500)`, filtros de organização, `deleted_at`, período e responsável.
- Atualizar a interface `DetailOpp` com os campos aninhados.
- Ajustar o JSX da lista para as três linhas descritas.

## Fora de escopo

Nenhuma alteração em banco, RPC, RLS, filtros, KPIs, cálculos ou nos cards. Somente apresentação e campos lidos no modal.
