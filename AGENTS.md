
- Edição de mensagem Evolution passa exclusivamente pela Edge Function `evolution-edit-message` + RPC `rpc_apply_message_edit_v1` (service_role); `message_edit_history` não é legível pelo frontend — porque o provider não confirma a edição e o histórico pode expor threads restritas.
- Widgets: catálogo vive só em `src/widgets/registry.ts`; banco guarda apenas configuração por org/tela e pins por usuário — evita catálogo divergente entre tenants e código.
- Perfil de sistema da org = `permission_profiles.is_system` (checar com `is_org_system_admin`), nunca pelo nome "Admin"; triggers de proteção liberam só execução interna (`current_user NOT IN (authenticated, anon)`) — porque nomes são editáveis e RPCs SECURITY DEFINER legítimas precisam passar.
