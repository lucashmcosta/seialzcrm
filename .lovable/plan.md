# Gate 2 — Dry-run final (read-only, já executado) + Teste sintético de unmerge parcial (pendente de aprovação)

Estou em modo de planejamento: consultas read-only já rodaram e estão abaixo. O teste sintético de unmerge parcial exige INSERT/UPDATE em dados de teste, portanto só pode ser executado após aprovação — nada real será tocado.

## Parte A — Dry-run final dos 89 (números atuais, pós-guard)

| Item | Valor |
| --- | --- |
| Grupos duplicados sales (org, contato, canal) | 90 |
| Pares candidatos | 90 |
| Pares bloqueados (MERGE_CHAIN_NOT_ALLOWED) | 1 |
| Pares executáveis | 89 |
| Winners distintos | 89 |
| Losers distintos | 89 |
| Nenhum loser é winner de merge ativo | confirmado (o único caso foi excluído) |
| Opportunity divergente (winner ≠ loser, ambos preenchidos) | 0 |
| Opportunity só no loser | 0 |
| Grupos em que o assignee mudará (política A) | 7 |
| Grupos em que o status subirá pelo rank | 24 |
| Messages a mover | 1.726 |
| message_thread_reads no loser | 107 |
| message_response_times no loser | 459 |
| thread_assignment_history no loser | 2 |
| scheduled_messages | 0 |
| tasks | 0 |
| ai_agent_logs | 0 |
| ai_interaction_logs | 0 |

Grupo excluído — **BLOCKER_FOR_UNIQUE = YES**
- Contato: `Joao Teste`
- winner `9c158663-a1d0-4ae8-a983-0c9653148c0e`
- loser `5f77df99-1562-4c68-9890-283d0f39a382` (já é winner de merge ativo)
- Permanece fora do lote e impede a criação do índice único comercial até resolução manual.

## Parte B — Teste sintético pendente: unmerge parcial de star merge

Cenário isolado (org de teste, contato sintético, 3 threads sales A/B/C com mensagens próprias):

1. Snapshot S0 de A
2. `merge_sales_threads(A, B)` → snapshot S1 de A
3. `merge_sales_threads(A, C)` → snapshot S2 de A
4. `unmerge_message_thread(B)` → snapshot S3 de A
5. `unmerge_message_thread(C)` → snapshot S4 de A

Cada snapshot capturará exatamente os 12 campos exigidos: `status`, `assigned_user_id`, `assigned_at`, `original_owner_user_id`, `last_message_id`, `last_message_at`, `last_message_content`, `last_message_direction`, `resolved_at`, `priority`, `category_id`, `needs_human_attention`.

Asserções a validar em S3:
- A reflete **A + C** (last_message_* aponta para a última mensagem real remanescente em A, que deve ser de C se ela for a mais recente) e **não** volta ao snapshot anterior ao merge C→A;
- auditoria B→A com `unmerged_at` preenchido; auditoria C→A ainda ativa;
- `C.merged_into_thread_id = A`;
- zero alteração nas mensagens de C (contagem e `merged_from_thread_id` intactos);
- `thread_assignment_history` coerente (sem linhas órfãs, entradas MERGE_SALES_V2 consistentes);
- `original_owner_user_id` de A não revertido indevidamente.

Em S4 (após unmerge de C): A volta a um estado coerente com apenas suas próprias mensagens.

Se qualquer asserção de S3 ou S4 falhar, paro imediatamente e reporto sem executar o lote real. Todo o dado sintético é removido ao final.

## Fora de escopo (não farei)
- Executar os 89 merges reais
- Criar o índice único comercial
- Ligar `conv_route_resolver_v2`
- Resolver o grupo Joao Teste
- Iniciar a Fase 3
