# Modelo de dados — Admin

| Tabela | Papel |
|---|---|
| `admin_users` | 15 col — auth admin separada (MFA) |
| `admin_sessions` | 9 col |
| `admin_audit_logs` | 9 col |
| `admin_notifications` | 7 col |
| `admin_integrations` | 13 col — catálogo global |
| `admin_one_off_jobs` / `admin_one_off_job_items` | Jobs ad-hoc |
| `impersonation_sessions` | 12 col — sessão de impersonação ativa |
| `feature_flags` | 7 col |
| `audit_logs` | 9 col — auditoria geral |
