## SuvSign V2 — multidocumento (2026-09-25)
- [x] Multiseleção dinâmica, prepare multi-template, participantes por identidade real (p1..pN), 1 operação
- [ ] E2E multidocumento — aguarda segundo template QA ativo na SuvSign

## SuvSign V2 — Proposta A (2026-09-25)
- [x] Lista + detalhe, A1, A2, A3, enviado, concluído no modal V2
- [ ] Copiar link — aguarda contrato SuvSign (links não persistidos; endpoint de recuperação [INCERTO])
- [ ] Descartar rascunho — omitido até teste E2E de cancel_signature sem provider_operation_id

- [x] Proposta A master/detail do modal V2 corrigido (estilos desatualizados no preview) — validado com dados simulados; conferência com login real pendente
- [ ] E2E Copiar link V2 — aguarda operação QA pendente (hoje 0 solicitações sent/in_progress)

- [x] Prévia A3: folha 816x1056 com escala e cabeçalho do snapshot (falta comparar com o PDF final)

- [x] V2: alias Custom.DataFechamento = deal_close_date (2026-09-26). [TODO] validar Contrato Unificado 2 na tela (usuário); inventário de placeholders dos templates reais da Central não disponível (só snapshots QA).

## Evolution — template fora de 24h (2026-09-28)
- [ ] Parte B1: provisionamento grava requires_template_outside_window por provider
- [ ] Parte B2: corrigir 3ed219e0 e 43cca41d para false (antes/depois)
- [ ] Parte C: Composer avalia o endpoint efetivo do "Responder por" — aguarda aprovação após Parte B
