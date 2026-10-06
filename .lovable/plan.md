# Edição de mensagens Evolution — resultado da Fase 0 e plano definitivo

## Resultado da Fase 0.2

### Parte 1 — envio pelo Seialz e edição (SEIALZ-E2E)
- `messages.id` 0874b89a-2189-403b-bd31-f7587fea7404, `endpoint_id` 3ed219e0… (Evolution 7020).
- O `whatsapp_message_sid` (3EB0A08785800FFB12F5BA) é igual a `metadata.evolution.response.key.id` e foi aceito pelo `updateMessage`.
- A edição respondeu HTTP 200 e mudou o texto no celular, com o rótulo "Editada".
- A linha em `messages` ficou idêntica, campo a campo; nenhum webhook chegou. Isso confirma a lacuna: o WhatsApp mostra a mensagem editada e o Seialz continua com o texto antigo.

### Parte 2 — janela de edição (uma tentativa por mensagem)

| Msg | Idade exata | HTTP | Resposta Evolution | Celular |
|---|---|---|---|---|
| J1* | 601 s (10m01) | 200 | protocolMessage MESSAGE_EDIT, PENDING | editou |
| J2 | 841 s (14m01) | 200 | idem | editou |
| J3 | 961 s (16m01) | 200 | idem | editou |
| J4 | 1201 s (20m01) | 200 | idem | **não editou** |
| J5 | 1801 s (30m01) | 200 | idem | **não editou** |
| J6 | 3601 s (60m01) | 200 | idem | **não editou** |

*J1 recebeu duas chamadas por acidente; vale só como prova de que 10 min é aceito.

### Conclusões
1. A janela real fica entre 16m01 e 20m01.
2. **A Evolution sempre responde 200/PENDING, mesmo quando o WhatsApp descarta a edição.** A resposta não confirma sucesso e não dá para usar 200 como prova.
3. A Evolution não envia nenhum webhook das edições feitas por nós, com ou sem `MESSAGES_EDITED`.
4. Consequência: o Seialz precisa impor a janela por conta própria e gravar a edição a partir da própria chamada.

## Plano definitivo

### Regras de negócio (precisam da sua confirmação)
- Pode editar apenas mensagem com todas estas condições: outbound, só texto, Evolution, não apagada, não nota interna, com `whatsapp_message_sid`, sem status de falha.
- Quem pode editar: [INCERTO] só o próprio autor (`sender_user_id`) ou também admin da organização. Proposta: só o autor.
- Limite no servidor: **15 min** a partir de `sent_at`, abaixo do mínimo comprovado de 16 min, como margem de segurança.
- Meta/Twilio ficam fora do escopo; o botão não aparece nesses canais.

### 1. Banco (migration)
- Novas colunas em `messages`: `edited_at timestamptz null`, `edited_by_user_id uuid null` e `edit_count int not null default 0`.
- Nova tabela `message_edit_history`: `message_id`, `organization_id`, `previous_content`, `new_content`, `edited_by_user_id`, `provider_response jsonb`, `created_at`. Terá RLS por `organization_id = ANY(current_user_org_ids())`, só leitura para membros, escrita só pelo service_role, e GRANTs.
- Triggers afetados pelo UPDATE de `content`: só `trg_update_thread_last_message`, que atualiza a prévia da conversa (efeito desejado), e `trigger_sanitize_agent_message_update`, que só roda para `sender_type='agent'` e não se aplica. Os demais triggers são de INSERT: não haverá nova activity, notificação, push nem análise de IA.

### 2. Edge Function `evolution-edit-message` (nova, publicada explicitamente)
- Entrada: `{ message_id, new_text }`, validada com Zod (texto não vazio, até 4096 caracteres).
- Validação do JWT e uso de `users.id` via `auth_user_id`. Checa que o usuário é membro ativo da organização da mensagem e tem acesso à thread.
- Carrega a mensagem e aplica as regras. Em caso de erro, devolve uma destas respostas:
  - 403 `not_author`
  - 409 `not_editable`
  - 409 `edit_window_expired`
  - 409 `content_unchanged`
- Resolve a instância pelo `endpoint_id` e chama `POST /chat/updateMessage/{instance}` com `key {remoteJid, fromMe:true, id: whatsapp_message_sid}`. O `remoteJid` vem de `metadata.evolution.response.key`.
- Se a resposta não for 2xx ou não trouxer `protocolMessage.type = MESSAGE_EDIT`, devolve erro com status e corpo da Evolution, sem alterar o banco.
- Se der certo, faz numa única transação/RPC: grava o histórico e atualiza `content`, `edited_at`, `edited_by_user_id` e `edit_count + 1`.
- Mantém o `whatsapp_message_sid` original; o key.id novo da edição fica só no histórico.
- Credenciais da Evolution ficam apenas no servidor.

### 3. Webhook (opcional, fase 2)
- Edições feitas no celular ou no WhatsApp Web também não chegam pelos eventos atuais.
- Fica como [TODO] separado: investigar se `MESSAGES_UPSERT` traz `protocolMessage` MESSAGE_EDIT nesses casos. Sem mudar o webhook agora.

### 4. UI Web (Messages e Inbox, sem fundir os módulos)
- O item "Editar" só aparece no menu da bolha da mensagem elegível, enquanto `sent_at` tiver menos de 15 min. Depois disso, ele some.
- Edição inline na bolha, com Salvar/Cancelar.
- Selo "Editada" (11px, junto ao horário) quando `edited_at` não for nulo.
- Erro de janela vencida: "O prazo para editar esta mensagem terminou".
- A tela atualiza em realtime pelo UPDATE em `messages`, que já é tratado no lugar.
- Aviso fixo: "A edição pode não aparecer para o contato se o WhatsApp recusar", porque não existe confirmação de entrega.

### 5. Mobile
Mesma função e o mesmo selo; o contrato fica documentado para o app nativo. O botão no app fica para depois.

### 6. Documentação e testes
- Atualizar `docs/modules/messages`, `docs/integrations/evolution` e `docs/integrations/edit-message`, incluindo a evidência da Fase 0.
- Testes Deno da edge function:
  - não autor;
  - outra organização;
  - provedor Meta;
  - mensagem com mais de 15 min;
  - texto igual;
  - Evolution respondendo não-2xx sem mudar o banco;
  - sucesso gravando o histórico.
- Fazer um teste real na 7020 antes de liberar.

## Perguntas para aprovar
1. Editar só pelo autor, ou também pelo admin da organização?
2. Limite de 15 min no servidor, ou exatamente 16?
3. Liberar só para a Central (piloto) ou para todas as organizações com Evolution?
