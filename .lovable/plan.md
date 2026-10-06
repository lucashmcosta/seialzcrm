# Auditoria read-only — 4 alertas de segurança (nada aplicado)

## 1. Três tabelas de backup
| Tabela | Linhas | Colunas | RLS | Policies |
|---|---|---|---|---|
| `_backup_ct_inbox_cleanup_2026_07` | 5.000 | id, prev_status, prev_resolved_at, prev_updated_at, planned_reason | off | 0 |
| `_document_submissions_backup_phase1` | 13 | id, organization_id, contact_id, document_type_id, attachment_id, status, uploaded_by/reviewed_by_user_id, datas, rejection_reason | off | 0 |
| `_documents_e1_backup` | 19 | id, entity_type, document_type_id | off | 0 |

GRANTs (ACL): `anon` e `authenticated` com todos os privilégios (arwdDxtm) nas três; `service_role` idem.
Quem acessa hoje: qualquer pessoa com a chave pública do app (mesmo sem login) consegue ler, inserir, alterar, apagar e truncar, via API.
Uso no código: nenhum (só aparecem nos tipos gerados). Nenhuma função/edge function lê essas tabelas.

Risco real:
- `_document_submissions_backup_phase1`: **alto** — expõe IDs de organização, contato, anexo e usuários de várias orgs (vazamento entre organizações, sem conteúdo de arquivo).
- `_backup_ct_inbox_cleanup_2026_07`: **médio** — só IDs e status anteriores; risco é alteração/apagamento do backup (perde rollback).
- `_documents_e1_backup`: **baixo** — IDs e tipo; mesmo risco de adulteração.

## 2. Policy de INSERT em `notifications`
- Policy: `System can insert notifications` — FOR INSERT, roles `public` (todos), permissiva, `WITH CHECK (true)`, sem USING.
- Demais policies: SELECT e UPDATE restritos a `user_id = current_user_id()` (corretas).
- GRANTs: `anon` e `authenticated` com todos os privilégios.

Quem depende de INSERT:
- Edge Functions (todas com service_role, que ignora RLS): `_shared/notify.ts`, `evolution-webhook`, `meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `scheduled-messages-cron`.
- Triggers SECURITY DEFINER (rodam como dono, ignoram RLS): `notify_new_message`, `notify_task_assigned`, `notify_opportunity_won`, `handle_handoff_notification`.
- Frontend (`src/components/Notifications.tsx`): só SELECT/UPDATE; nenhum insert no app. [INCERTO] app nativo mobile — confirmar que não insere direto.

Risco real: **médio** — qualquer usuário logado (ou anônimo com a chave pública) pode criar notificações falsas para qualquer usuário de qualquer organização (phishing interno/spam, possível disparo de push se houver trigger de push em notifications). Não permite ler dados.

## 3. Correção mínima proposta (não aplicada)
Tabelas de backup (opção conservadora, preserva dados):
```sql
ALTER TABLE public.<backup> ENABLE ROW LEVEL SECURITY;  -- sem policies
REVOKE ALL ON public.<backup> FROM anon, authenticated;
```
Só service_role/postgres continuam acessando. Alternativa futura: exportar e DROP após confirmação de que não são mais necessárias para rollback.

`notifications`:
```sql
DROP POLICY "System can insert notifications" ON public.notifications;
REVOKE INSERT ON public.notifications FROM anon;
-- authenticated: manter GRANT, mas sem policy de INSERT => insert negado
```
Inserção continua funcionando para edge functions (service_role) e triggers SECURITY DEFINER. Antes de aplicar: confirmar no app nativo e checar se há trigger de push dependente.

## Validação após aplicar (quando aprovado)
- Re-scan de segurança; teste de insert como authenticated deve falhar; enviar mensagem/tarefa real e confirmar que notificação chega.
