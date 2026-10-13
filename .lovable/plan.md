# Correção urgente: escopo do RBAC v2 nas funções que o app usa

## Resultado da auditoria (lido no banco agora)

As 6 funções rodam com privilégio elevado (SECURITY DEFINER), ou seja, ignoram a regra de acesso da tabela. Cada uma precisa aplicar o escopo por conta própria.

| Função | Checa vínculo com a org | Aplica escopo do RBAC v2 | Situação |
|---|---|---|---|
| rpc_search_contacts (contatos do app) | Sim, mas não confere se o vínculo está ativo | Não | VAZA: devolve todos os contatos da org |
| rpc_list_inbox_threads (lista do Atendimento) | Sim | Não | VAZA: devolve todas as conversas de Atendimento da org |
| rpc_inbox_queue_counts (contadores do Atendimento) | Sim | Não | VAZA números: conta conversas que a pessoa não pode ver |
| rpc_list_message_threads (lista do Comercial) | Sim | Sim (usa a mesma checagem da regra da tabela) | OK |
| get_home_dashboard_stats (Início) | Sim, com vínculo ativo | Parcial: usa a chave antiga "ver todas as oportunidades"; trata qualquer outra coisa como "meus" | Sem vazamento grande; "equipe" vê menos que deveria; "nenhum" vê os próprios |
| get_opportunity_stage_counts (contadores do funil) | Não confere o vínculo | Parcial: chave antiga "ver todas" ou "dono" | Pequeno risco: aceita qualquer org; "equipe"/"nenhum" igual acima |

## O que será corrigido (uma migração por função, rollback salvo antes)

1. **rpc_search_contacts** — mesma assinatura e mesmos parâmetros (inclusive `p_owner_user_id`). Nos três caminhos (sem busca, telefone, texto) entra o filtro que a tabela já usa para contatos: ver "nenhum" → nada; "meus" → os dela; "equipe" → os da equipe; "todos" → tudo; contato sem responsável só aparece se o perfil tiver "inclui sem responsável" (ou ver "todos"). Vínculo passa a exigir pessoa ativa. O total retornado passa a contar só o que ela pode ver.
2. **rpc_list_inbox_threads** — mesmo filtro da regra da tabela de conversas (Atendimento ou Comercial conforme o tipo da conversa), aplicado antes do limite e da ordenação. Assinatura atual mantida (inclui `p_unassigned_only`).
3. **rpc_inbox_queue_counts** — o mesmo filtro, para os números baterem com a lista.
4. **get_opportunity_stage_counts** — passa a exigir vínculo ativo com a org e a usar o escopo de oportunidades do RBAC v2.
5. **get_home_dashboard_stats** — passa a usar o escopo de oportunidades do RBAC v2 ("todos" segue podendo filtrar por responsável; "meus" vê os próprios; "nenhum" vê zero). "Equipe" fica tratada como "meus" nesta correção (sem vazamento); suporte a equipe no painel fica como [TODO], porque exige mexer no cálculo interno.
6. **rpc_list_message_threads** — nada muda.

Ordem: 1, 2, 3 (urgentes, vazamento real), depois 4 e 5. Cada uma: rollback em `docs/platform/security/rbac-v2/rollback/`, DROP/CREATE só se necessário (preferir CREATE OR REPLACE, sem sobrecarga, mesmos grants, SECURITY e search_path), `NOTIFY pgrst, 'reload schema'`, registro no log.

## Verificação
- Conferir que cada função tem uma única versão e os mesmos grants de antes.
- Comparar contagens por pessoa da Central: para Consultoras ("meus"), resultado de rpc_search_contacts = contatos dela (ex.: Tamires ~5.7 mil, Ketlyn 838, Talita 826), igual ao que o web mostra; Admins continuam vendo os ~19,5 mil.
- Atendimento: para cada pessoa, lista e contadores = mesmas conversas que a regra da tabela libera.
- Limitação conhecida: a conexão de leitura não simula usuário logado; a simulação será feita dentro da migração de teste com transação desfeita (como no B6/B7), ou eu peço que a Consultora reabra o app para confirmar.

## Detalhes técnicos
- Filtro padrão a inserir: `rbac_check((SELECT rbac_ctx()), c.organization_id, 'contatos', 'ver', ARRAY[c.owner_user_id])` com `v_ctx := rbac_ctx()` calculado uma vez em variável; para conversas `rbac_check(v_ctx, t.organization_id, rbac_thread_obj(t.business_context), 'ver', ARRAY[t.assigned_user_id])`.
- Fora do modo rbac_v2 (flag desligada em emergência), cair na regra antiga igual à da tabela (`user_can_view_all` ou dono), via `rbac_v2_on(org)`.
- Admin de plataforma (`is_admin_user()`) mantém acesso, igual à regra da tabela.
- Índices existentes de busca seguem sendo usados; o escopo é filtro adicional.
