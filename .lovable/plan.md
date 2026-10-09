# Mensagens de permissão em português + botões bloqueados (sem mudar regras)

## Item 3 — resultado da consulta (só leitura, nada alterado)

Perfis comuns (fora o perfil de sistema) que veem Atendimentos ou Conversas comerciais, mas têm Encerrar ou Atribuir em "nenhum". AT = Atendimentos, CC = Conversas comerciais (ver / encerrar / atribuir).

| Organização | Perfil | Pessoas | AT | CC |
|---|---|---|---|---|
| Campoar | Sales Rep | 12 | todos / nenhum / nenhum | todos / todos / nenhum |
| Central Trabalhista | Consultor | 7 | nenhum / nenhum / nenhum | meus / meus / nenhum |
| Central Trabalhista | Juridico | 6 | todos / nenhum / nenhum | todos / todos / nenhum |
| Viagi | Sales Rep | 6 | todos / nenhum / nenhum | todos / todos / nenhum |
| blueviza | Sales Rep | 1 | todos / nenhum / nenhum | todos / todos / nenhum |
| Blueviza, Minha Empresa (4), Squadra (2), Plamev, VIAGI, Viagi (Sales Rep + Customer Service) | — | 0 cada | todos / nenhum / nenhum | todos / todos / nenhum |
| MSM Soluções Metlálicas | Sales Rep | 0 | meus / nenhum / nenhum | meus / meus / nenhum |

Em resumo: 32 pessoas em 5 perfis em uso não conseguem atribuir em nenhum dos dois módulos, e não conseguem encerrar Atendimentos. Nada será corrigido automaticamente.

## Item 1 — Textos de erro

O servidor usa só 4 códigos: `rbac_close_denied`, `rbac_assign_denied`, `rbac_create_denied`, `rbac_delete_denied`. Eles serão traduzidos assim:
- close: "Você não tem permissão para resolver esta conversa."
- assign: "Você não tem permissão para reatribuir esta conversa."
- create: "Você não tem permissão para criar este registro."
- delete: "Você não tem permissão para excluir este registro."
- `rbac_*` sem tradução: "Você não tem permissão para esta ação."

## Item 2 — Botões

Quando o perfil não permitir a ação, o botão continua visível, mas desabilitado, com uma dica explicando o motivo ao passar o mouse (no celular, aparece um aviso ao tocar). Telas:
- Atendimento (web e celular): Resolver/Encerrar, Reatribuir para mim, Atribuir/Transferir.
- Comercial (web e celular): Encerrar, Atribuir responsável, Reatribuir.
- Contatos, Oportunidades e Tarefas: Excluir (individual e em massa) e Novo, quando o perfil não puder criar.

O escopo é respeitado: com "meus", o botão só fica liberado em itens atribuídos à própria pessoa; com "equipe", em itens da própria equipe; com "todos", sempre. Em itens sem responsável, vale a opção "sem responsável" do perfil. O servidor continua sendo quem decide; a tela só antecipa a resposta.

## Detalhes técnicos

- Novo `src/lib/permissions/errors.ts` com `rbacErrorMessage(err)`. Ele será usado dentro de `toErrorMessageString`, para que todos os avisos e toasts existentes passem a mostrar o texto traduzido sem ser preciso alterar cada tela.
- Novo hook `useCan(path, record?)` em `usePermissions.ts`. Ele lê `canV2`/`permAt` e compara o escopo com `assigned_user_id`/`owner_user_id` e com `my_team_user_ids` (que já existe; será carregado uma vez e guardado em cache).
- Componente `PermissionGate` (Tooltip + `disabled`), aplicado em InboxThreadDetail, MobileInbox, SalesConversationHeader/MessagesList, MobileMessagesList, BulkActionsBar e nos botões Novo e Excluir das listas.
- Sem migration, sem mudança em policies ou RPCs, sem Edge Functions. O mapeamento do business_context (Comercial ou Atendimento) segue o que já existe: nulo é tratado como Comercial.
- Verificação: typecheck, teste unitário de `rbacErrorMessage` e do `useCan` (escopos meus/equipe/todos/sem responsável), e captura de tela simulando um perfil Consultor.
