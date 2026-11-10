# ADR-0013 — Motivos de perda com detalhe e histórico de perdas

Status: aceito (2026-11-10). Migrations `20261110120000`…`20261110130000`, aplicadas em produção em 2026-11-10.

## Decisão
- Dois níveis por organização: motivo (`opportunity_loss_reasons`) e detalhe (`opportunity_loss_reason_details`). Uma lista por org, válida para o funil inteiro (não há tabela de pipelines; vínculo por pipeline fica para quando houver múltiplos funis).
- **Código gerado pelo banco**: motivo = letras em sequência (A…Z, AA…); detalhe = código do motivo + número (A1…). Contadores em `opportunity_loss_code_counters` só sobem: código nunca é reaproveitado. Código não muda. Relatórios, automação e API usam o código.
- **Histórico append-only** em `opportunity_losses`: toda transição para Perdida grava uma linha (motivo/detalhe com código copiado, descrição, etapa anterior, autor `user|automation|agent|api|system`, `automation_ref`, origem). Reabrir só fecha a linha; perder de novo cria outra. Correção de motivo vai para `opportunity_loss_corrections` com o valor anterior.
- Pessoa marca perda por `mark_opportunity_lost_v1` (ou lote). O trigger `trg_guard_opportunity_lost_v1` cobre os demais caminhos: se a org tem motivo ativo e motivo obrigatório, pessoa logada não perde sem a RPC; nos outros casos a perda é registrada sem motivo. **Org sem motivo ativo continua perdendo como antes.** Oportunidade criada já perdida (import) não é travada nem registrada.
- Regras gerais em `opportunity_loss_settings` (sem linha = motivo obrigatório + detalhe opcional). "Detalhe desligado" e "só automação" valem só para pessoas; automação/API gravam qualquer detalhe ativo pelo código.
- Regra por etapa (`opportunity_loss_stage_rules`): cadastro, validação e pendências aqui; execução automática pela integração via `loss_stage_rule_detail_v1` (NULL = não gera perda).
- Permissões: cadastro/regras = perfil de sistema ou Administração › Configurações (`can_manage_loss_reasons`); marcar = `can_edit_opportunities`; corrigir = `ferramentas.corrigir_motivo_perda`.

## Por quê
Relatório e automação precisam de um identificador fixo; o nome muda. O histórico não pode ser sobrescrito, e nenhuma org pode ser bloqueada no dia da entrega.

## Pronto para a integração
`fn_mark_opportunity_lost_internal_v1` (service_role) recebe `actor_type`, `automation_ref` e o id do detalhe; a entrada por código resolve `code → id` e chama essa função.
