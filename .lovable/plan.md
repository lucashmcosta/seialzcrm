# Motivos de perda com detalhe (Seialz Sales)

## O que encontrei hoje (respondendo a pergunta em aberto para o Junior)
- Nenhuma organizacao guarda motivo de perda hoje. `opportunities` so tem `status`, `lost_at` e `lost_at_source`; nao ha campo de motivo nem texto livre. O unico `lost_reason` existente (em `opportunity_behavior_snapshot`) esta vazio em todas as linhas.
- Ha 20.367 oportunidades perdidas em 5 organizacoes. Nada sera preenchido retroativamente; nao ha texto antigo a preservar.
- Nao existe cadastro de "pipelines": cada organizacao tem um unico funil (`pipeline_stages` por organizacao). [INCERTO] O filtro "motivo vale para pipelines selecionados" nao tem onde se apoiar hoje.

## Decisao necessaria antes de construir
O filtro por pipeline do documento depende de multiplos pipelines, que nao existem. Proposta: nesta entrega guardar o campo "Pipelines = Todos" e deixar a escolha por pipeline como [TODO] ate existir cadastro de pipelines. A "regra por etapa" funciona normalmente, pois as etapas existem.

## Entrega em 3 fases

### Fase 1 — Cadastro e marcacao pela pessoa
- Tabelas por organizacao: motivos, detalhes, regras gerais (motivo obrigatorio = sim; detalhe = opcional) e historico de perdas (motivo, detalhe, descricao, etapa, quem marcou: pessoa ou automacao, data/hora). Nunca sobrescrito.
- Tela em Configuracoes > Sales > Motivos de perda (somente administrador): motivos e detalhes com codigo, ordem, situacao, texto de ajuda, exige descricao, quem pode marcar.
- Integridade no servidor: codigo imutavel apos uso e nunca reaproveitado; usado nao apaga, so inativa; detalhe nao troca de motivo; inativar motivo esconde seus detalhes.
- Janela "Marcar como Perdida" em todos os pontos que hoje marcam perda (detalhe, Kanban, acoes em lote, ficha nas Mensagens): so motivos/detalhes ativos e marcaveis por pessoas.
- Regras validadas no servidor (funcao unica de marcar perda + bloqueio em mudanca direta de status), para nenhuma tela escapar.
- Migracao segura: organizacao sem motivos cadastrados continua marcando perda como antes, mesmo com "motivo obrigatorio = sim" (regra so passa a valer quando houver pelo menos um motivo ativo).
- Reabrir: volta para a etapa onde estava; a perda anterior fica no historico.
- Corrigir motivo de perda ja gravada: permissao nova no RBAC V2 ("Corrigir motivo de perda"), registrando quem, quando e valor anterior.

### Fase 2 — Automacao e integracao
- Perda por codigo do detalhe para automacoes, agente de IA e API; codigo invalido/inativo e recusado e o erro fica registrado e visivel para o administrador.
- Regra por etapa: detalhe aplicado quando a oportunidade para naquela etapa sem resposta; regra apontando para detalhe inativo vira pendencia visivel.
- Evento de perda (webhook) com codigo do motivo, codigo do detalhe, descricao, etapa e quem marcou.
- [INCERTO] Qual mecanismo atual define "parou sem resposta" — verificar automacoes existentes no inicio da fase.

### Fase 3 — Relatorio
- Perdas por motivo e detalhe (quantidade e %), agrupado por codigo, com filtros por etapa, periodo, origem e responsavel; separacao pessoa x automacao; inativos aparecem nos periodos usados.

## Fora do escopo
Lista padrao de motivos, sugestao por IA, motivos de ganho, terceiro nivel.

## Detalhes tecnicos
- Novas tabelas com GRANT + RLS por `organization_id = ANY(current_user_org_ids())`; escrita de cadastro so por admin do sistema da org; historico gravado apenas por RPC SECURITY DEFINER.
- RPC `rpc_mark_opportunity_lost_v1` (pessoa) e `rpc_mark_opportunity_lost_by_code_v1` (automacao/API), sem overloads.
- Trigger em `opportunities` impede `status = lost` sem passar pela RPC quando a organizacao tem motivos ativos.
- Testes de cada regra dos criterios de aceite; ADR novo em `docs/decisions/` e doc em `docs/modules/opportunities/`.
- Pergunta: comecar so pela Fase 1, ligada primeiro em uma organizacao piloto?
