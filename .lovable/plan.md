# Edição de mensagem Evolution — V1 piloto (Central Trabalhista)

## Evidência que embasa o plano (Fase 0, concluída)
- A Evolution 2.3.7 (`POST /chat/updateMessage/{instance}`) edita usando `key.id = messages.whatsapp_message_sid`. Comprovado de ponta a ponta a partir do Seialz.
- Janela real entre 16m01 (editou) e 20m01 (não editou).
- A Evolution responde **200/PENDING mesmo quando o WhatsApp descarta a edição**. Por isso a janela de 15 min no servidor é a única proteção.
- Não chega nenhum webhook das nossas edições, com ou sem `MESSAGES_EDITED`. O Seialz grava a edição a partir da própria chamada.

## Decisões aprovadas
- Edita apenas o autor (`sender_user_id` = usuário autenticado). Admin não edita mensagem de outro usuário.
- Janela de 15 min a partir de `sent_at`, validada na Edge Function. A regra no frontend serve só para a interface.
- Código genérico para Evolution, liberado só para a Central pela flag `evolution_message_edit_v1`.
- Histórico só no servidor: sem leitura pelo frontend.
- Meta e Twilio ficam intocados.
- Edições feitas no celular ficam como [TODO].

## 1. Migration
- **`messages`:** novas colunas `edited_at timestamptz null`, `edited_by_user_id uuid null` (FK `users.id`) e `edit_count int not null default 0`. Nada muda em policies, triggers ou na RPC de listagem.
- **Nova tabela `message_edit_history`.** Colunas:
  - `id`, `message_id` (FK `messages` on delete cascade), `organization_id`, `thread_id`
  - `previous_content text`, `new_content text`, `edited_by_user_id`
  - `provider`, `provider_edit_key_id text` (key.id da edição), `provider_response jsonb`
  - `created_at`
- **Acesso ao histórico:**
  - `GRANT ALL ... TO service_role` apenas; `REVOKE ALL ... FROM anon, authenticated`.
  - RLS ligada **sem nenhuma policy**: nenhuma leitura ou escrita pelo frontend.
  - Índice em `(message_id, created_at)`.
- **RPC `rpc_apply_message_edit_v1(p_message_id, p_expected_content, p_new_content, p_user_id, p_edit_key_id, p_response)`:**
  - `security definer`, `search_path=public`, `EXECUTE` revogado de `public`/`anon`/`authenticated` e concedido só ao `service_role`.
  - Numa única transação: `SELECT ... FOR UPDATE` na mensagem, confere que o conteúdo ainda é o esperado (senão `concurrent_edit`), insere o histórico e faz `UPDATE messages SET content, edited_at=now(), edited_by_user_id, edit_count+1`.
  - O `whatsapp_message_sid` não é alterado.
- **Triggers afetados pelo UPDATE:**
  - `trg_update_thread_last_message` atualiza a prévia da conversa, como desejado.
  - `trigger_sanitize_agent_message_update` só roda para mensagens de agente, então não se aplica.
  - Os demais são só de INSERT. Não há nova activity, notificação, push, IA nem evento de integração.
- **Flag:** registro `evolution_message_edit_v1` em `feature_flags` com `organization_ids = [40ae935c…]`, inserido por gravação de dados, não por migration.

## 2. Edge Function `evolution-edit-message` (nova)
- Configuração `verify_jwt = false` explícito em `config.toml`, com JWT validado no código. Import `jsr:@supabase/supabase-js@2`.
- **Entrada (Zod):** `{ message_id: uuid, new_text: string 1..4096 }`; a função remove espaços nas pontas do texto.
- **Ordem das verificações** (fail-closed). A primeira que falhar retorna o erro indicado:

| Passo | Verificação | Erro |
|---|---|---|
| 1 | JWT válido; `users.id` via `auth_user_id` | 401 |
| 2 | Carrega a mensagem com service_role | 404 `not_found` |
| 3 | Usuário é membro ativo da `organization_id` da mensagem | 403 `forbidden` |
| 4 | Flag `evolution_message_edit_v1` ligada para a organização (`_shared/feature-flags.ts`) | 403 `feature_disabled` |
| 5 | `sender_user_id = me.id` e `sender_type='user'` | 403 `not_author` |
| 6 | `direction='outbound'`, sem `deleted_at`, não é nota interna, sem template, sem mídia, sem `error_code` e com `whatsapp_message_sid` | 409 `not_editable` |
| 7 | Endpoint (`endpoint_id`) com provider canônico `evolution_api` | 409 `provider_not_supported` |
| 8 | `now() - sent_at <= 15 min` | 409 `edit_window_expired` |
| 9 | Texto novo diferente do atual | 409 `content_unchanged` |

- **Validação do `remoteJid`:**
  - Precisa existir em `metadata.evolution.response.key.remoteJid`, terminar em `@s.whatsapp.net` e ter os dígitos iguais a `metadata.evolution.to`.
  - `key.id` salvo deve ser igual a `whatsapp_message_sid` e `fromMe` deve ser `true`.
  - Se qualquer item falhar: 409 `remote_jid_invalid`.
- **Instância:** a função usa o mesmo caminho do `evolution-whatsapp-send` (`evolution_instances.instance_name` pelo endpoint) e confere que bate com o `metadata.evolution.instance_name`. Se não bater, retorna 409 `instance_mismatch`.
- **Chamada à Evolution:** `POST /chat/updateMessage/{instance}` com `{number, key:{remoteJid, fromMe:true, id}, text}`, timeout de 15 s. As credenciais ficam só no servidor (`EVOLUTION_BASE_URL`/`EVOLUTION_GLOBAL_API_KEY`) e não aparecem em log nem em resposta.
- **Resposta aceita:**
  - Precisa ser 2xx com `message.protocolMessage.type == 'MESSAGE_EDIT'` e `protocolMessage.key.id == whatsapp_message_sid`.
  - Caso contrário, retorna 502 `provider_rejected` com o status e o corpo da Evolution. O banco não é tocado.
- **Gravação:** chama a RPC acima e devolve `{ message_id, content, edited_at, edit_count }`. Se a gravação falhar depois que a Evolution aceitou, a função registra um log de erro e retorna 500 `persist_failed`. Esse cenário fica documentado.
- **Sem dependência de módulo:** a função não conhece Messages nem Inbox. Vale para qualquer thread, porque a autorização vem da autoria, da organização e do provider.

## 3. Frontend (Web)
- **`src/lib/messageEdit.ts`:** função pura `canEditMessage(msg, me, provider, flagOn, now)` com as mesmas regras, usada só para mostrar o botão. Também concentra o mapeamento dos códigos de erro para textos em PT-BR.
- **`src/hooks/messages/useMessageEdit.ts`:** chama `supabase.functions.invoke('evolution-edit-message')`, lê o erro via `FunctionsHttpError` e atualiza o cache da mensagem quando dá certo.
- **Leitura da flag:** acrescentar `evolution_message_edit_v1` à query única de flags já existente (`useSalesFeatureFlags` / equivalente no Inbox), sem query nova.
- **Bolha da mensagem** (`WhatsAppChat.tsx` e a bolha usada em Messages):
  - Item "Editar" no menu, só quando `canEditMessage` permite. Ele some quando os 15 min passam, com um timer local.
  - Edição inline com Salvar/Cancelar (Enter salva, Esc cancela).
  - Selo "Editada" (11px) junto ao horário quando `edited_at` não for nulo.
  - Na edição, aviso discreto: "O WhatsApp pode não confirmar a edição para o contato."
- **Mensagens de erro:**
  - Prazo vencido: "O prazo de 15 minutos para editar terminou."
  - Recusa do provedor: "O WhatsApp recusou a edição."
- **Mobile web (`MobileMessagesList.tsx`):** apenas o selo "Editada". O botão fica para depois.

## 4. Documentação
- `docs/integrations/evolution-api/`: nova seção "Edição de mensagens", com evidência da Fase 0, contrato da função, códigos de erro, 200/PENDING não confiável e o [TODO] de sincronizar edições feitas no celular.
- `docs/modules/messages/` e `docs/modules/inbox/`: selo "Editada" e as regras.
- Contrato para o app nativo: chamar a mesma função e ler `edited_at`.

## 5. Testes antes de liberar
- **Testes Deno da função**, com a Evolution simulada. Cada caso abaixo é um teste:
  - não autor
  - outra organização
  - flag desligada
  - Meta/Twilio
  - mensagem de mídia/template/nota
  - 15m01
  - texto igual
  - `remoteJid` ausente ou divergente
  - instância divergente
  - Evolution não-2xx
  - Evolution 2xx sem `MESSAGE_EDIT`
  - sucesso, com uma linha nova no histórico e a mensagem atualizada
  - conflito de edição simultânea
- **Teste real na 7020:** enviar uma mensagem pelo Seialz para João Teste, editar pela interface, conferir no celular e confirmar no Seialz o selo "Editada", a prévia da conversa e a linha de histórico.
- **Publicação:** só depois disso, publicação explícita da função e do frontend.

## Arquivos afetados
- Novos:
  - `supabase/functions/evolution-edit-message/index.ts`
  - `supabase/functions/evolution-edit-message/index.test.ts`
  - `src/lib/messageEdit.ts`
  - `src/hooks/messages/useMessageEdit.ts`
- Alterados:
  - `supabase/config.toml` (entrada da função)
  - `useSalesFeatureFlags.ts` (flag)
  - componentes de bolha (menu, editor inline e selo)
  - `MobileMessagesList.tsx` (selo)
  - documentação
- Intocados: `evolution-whatsapp-send`, `evolution-webhook`, configuração do webhook na Vultr, `dispatch-whatsapp-send`, Meta, Twilio e a RPC de listagem de threads.
