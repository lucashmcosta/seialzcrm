# Fechar a política de criação de notificações (auditoria concluída)

## Resultado da auditoria (somente leitura)
Somente 4 funções do banco mencionam `notifications`. As 4 inserem nela diretamente, e cada uma é chamada por uma única trigger:

| Tabela origem | Trigger | Função | SECURITY DEFINER | Owner | search_path |
|---|---|---|---|---|---|
| messages | new_message_notification | notify_new_message | sim | postgres | public |
| message_threads | trg_handoff_notification | handle_handoff_notification | sim | postgres | public |
| opportunities | opportunity_won_notification | notify_opportunity_won | sim | postgres | public |
| tasks | task_assigned_notification | notify_task_assigned | sim | postgres | public |

- As 4 triggers estão ativas. O INSERT acontece dentro da própria função, sem chamar outra função.
- Nenhuma trigger, ou função chamada por trigger, escreve em notifications a partir de contacts, contact_identity_profiles, calls, activities, documents ou message_thread_reads.
- Não existe nenhuma trigger na própria tabela notifications, então não há disparo de push ligado a ela.
- As Edge Functions usam service_role, que ignora RLS e GRANTs. O app web e o app mobile não inserem nessa tabela.

## Conclusão
Revogar INSERT de anon e de authenticated **não quebra nenhuma operação legítima iniciada por um usuário**. As funções que rodam como SECURITY DEFINER executam como owner postgres, que continua com permissão. O search_path está fixo em public.

## Correção aprovada (só aplicar depois que você aprovar)
Uma única migration:
```sql
DROP POLICY "System can insert notifications" ON public.notifications;
REVOKE INSERT ON public.notifications FROM anon;
REVOKE INSERT ON public.notifications FROM authenticated;
```
As permissões de SELECT e UPDATE e as policies de cada usuário continuam como estão.

## Validação depois de aplicar
- Tentar um insert como authenticated: deve ser recusado.
- Enviar uma mensagem ou atribuir uma tarefa real: a notificação ainda deve aparecer.
- Rodar a verificação de segurança de novo.
- As tabelas de backup ficam fora desta etapa.
