
- Edição de mensagem Evolution passa exclusivamente pela Edge Function `evolution-edit-message` + RPC `rpc_apply_message_edit_v1` (service_role); `message_edit_history` não é legível pelo frontend — porque o provider não confirma a edição e o histórico pode expor threads restritas.
