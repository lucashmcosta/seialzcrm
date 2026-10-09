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
- [x] Parte B1: provisionamento grava requires_template_outside_window por provider
- [x] Parte B2: corrigir 3ed219e0 e 43cca41d para false (antes/depois)
- [x] Parte C: Composer avalia o endpoint efetivo do "Responder por" (`src/lib/composerCapability.ts`), capability lida da opção do "Responder por" — publicado

## Widgets V1 (2026-10-08)
- [x] Migration ajustada aplicada
- [x] Registry + Configurações → Widgets + trigger Comercial/Atendimento + pins + hosts
- [x] Calculadora de Horas Extras V1
- [ ] Validação visual Comercial/Atendimento — aguarda teste com login real (não consigo entrar na prévia deste projeto)

## Segurança + RBAC v2 com Equipes (2026-10-09) — log em docs/platform/security/rbac-v2/etapa1-log.md
- [x] A0 diagnóstico + snapshot
- [x] A1 backups fechados
- [x] A2 perfil de sistema
- [ ] A3 users.is_platform_admin protegido + link /admin
- [ ] A4 user_organizations + revogação de sessão (edge function para Admin da org)
- [ ] A5 organizations
- [ ] A6 export-conversations
- [ ] A7 lixeira
- [ ] A8 views security_invoker
- [ ] A9 rpc_list_message_threads
- [ ] B1–B7 RBAC v2 (flag, equipes, catálogo, resolver, telas, teste, ligar global)
- [x] A2–A9
- [x] B1 (sem org de teste — removida por decisão do usuário), B2, B3
- [ ] B4 travas no servidor atrás da flag
- [x] B5 telas
- [x] B6 simulação
- [ ] B7 ligar para todos com foto antes/depois
- [ ] Relatório final + lista de conferência manual (Admin e operador)
