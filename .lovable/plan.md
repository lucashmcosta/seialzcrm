# Atribuição em lote — Comercial sem responsável (Viagi e blueviza)

## 1. Conferência (já feita, só leitura)

| Organização | id | Conversas abertas do Comercial sem responsável | Usuário ativo encontrado | Perfil | Vê Conversas comerciais |
|---|---|---|---|---|---|
| Viagi | b246ef6f… | 47 | Ketlyn Vieira (95697f6c…) — único "Ketlyn" | Admin (perfil de sistema) | Sim, "todos" |
| blueviza | f677a500… | 141 | Lucas Costa (58ce5ec9…) — único "Lucas" | Admin (perfil de sistema) | Sim, "todos" |

- Existem outras organizações com nome parecido (Blueviza, VIAGI e uma segunda Viagi); todas têm 0 conversas nesse critério e ficam fora.
- Na Viagi também existem "Lucas Costa" e "Lucas Kim", mas não importam: na Viagi o destino é a Ketlyn.
- Nenhuma parada foi necessária: um único nome em cada organização.

## 2. O que será feito

Uma única operação no banco, por organização, com o id fixo da organização e da pessoa:
- Conversas com `status` diferente de resolvida/encerrada, sem responsável, e `business_context` = 'sales' ou vazio.
- Só o responsável da conversa muda. Dono do contato, status, mensagens e Atendimento/'other' não mudam.
- O histórico de atribuição de cada conversa recebe o motivo "Atribuída em lote pelo administrador" (tipo `manual_assignment`).
- Uma notificação resumo para cada pessoa: "47 conversas foram atribuídas a você" (Ketlyn) e "141 conversas foram atribuídas a você" (Lucas), com os números reais da execução.

## 3. Cuidados confirmados

- O aviso automático de "conversa transferida" só dispara quando a conversa passa a precisar de atendimento humano; esse campo não será tocado, então não sai notificação por conversa.
- Não há envio de mensagem nem webhook ligado à troca de responsável nessas conversas; nenhuma mensagem é gravada.
- A trava de permissão aceita a operação interna do administrador do sistema.

## 4. Conferência depois

- Contar quantas foram para cada pessoa (esperado 47 e 141).
- Confirmar que restam 0 conversas nesse critério nas duas organizações, que as de 'other' e de Atendimento continuam como estavam, e que nenhuma outra organização teve conversa alterada no horário da operação.
- Confirmar 1 linha de histórico por conversa e só 2 notificações novas.
- Registrar tudo em `docs/platform/security/rbac-v2/etapa1-log.md`.

## Detalhes técnicos

- `UPDATE message_threads SET assigned_user_id = <pessoa>, last_routing_decision = jsonb_build_object('action','manual_assignment','reason','Atribuída em lote pelo administrador','source','bulk_admin_2026-10-09') WHERE organization_id = <org> AND assigned_user_id IS NULL AND status NOT IN ('resolved','closed') AND COALESCE(business_context,'sales')='sales' RETURNING id` — o trigger `trg_log_thread_assignment_change` grava `thread_assignment_history`.
- Antes do update: guardar a lista de ids (para conferência e eventual desfazer).
- Notificação: 1 INSERT em `notifications` por pessoa, `type='bulk_assignment'`, `entity_type='message_thread'`.
- Para desfazer: voltar `assigned_user_id` a NULL nos ids guardados.
