# Auditoria (somente leitura): "Enviar pelo WhatsApp" da assinatura V2

Nenhuma alteração no web, no servidor ou no banco. Fontes: `supabase/functions/_shared/signature-whatsapp.ts` (`handleSignatureWhatsApp`), `supabase/functions/signature-requests/index.ts`, `_shared/meta-template-components.ts` e `src/components/signature/SignatureWhatsAppDialog.tsx`.

Todas as ações abaixo usam a edge `signature-requests` com `{ action, ... }` e a sessão do usuário (JWT). A solicitação é carregada com a RLS do usuário por `loadRequest`. Se o usuário não enxergar a solicitação, a resposta é 404 "Solicitação não encontrada.".

## 1) Contador "Nx"
- Tabela: `public.signature_whatsapp_deliveries`. Não existe coluna em `signature_request_participants`.
- Leitura direta pelo PostgREST: **não é possível**. A migration dá `GRANT ALL` só ao `service_role`. O mobile precisa usar a action `get_whatsapp_summary` com `{ request_id }`.
- Resposta: `{ participants: { [participant_uuid]: { sent_count, last_sent_at, pending_count } } }`.
- `sent_count` conta as linhas com `status='sent'`, ou seja, mensagens que a Meta aceitou pelo dispatcher. Não conta entregas/leituras, tentativas `failed` nem "Copiar link". `pending_count` conta as linhas com status `pending` ou `unknown`.

## 2) Ação de envio
1. `get_whatsapp_context` `{ request_id, participant_id }` → `{ participant{id,name,email}, contacts[], endpoints[], templates[], settings[], can_configure, last_delivery, last_sent }`.
2. `send_whatsapp_link`, com todos os campos obrigatórios exceto `resend_of`:
   - `request_id`, `participant_id`: UUID da linha
   - `endpoint_id`: UUID
   - `contact_id`: UUID
   - `delivery_id`: UUID gerado no cliente, um por abertura da prévia
   - `settings_updated_at`: exatamente o `settings[].updated_at` recebido
   - `resend_of`: id de `last_sent`, obrigatório quando já houve envio
   - Sucesso: `{ ok:true, message_id, thread_id }`. Ao repetir o mesmo `delivery_id` que já foi enviado: `{ ok:true, already_sent:true, message_id, thread_id }`.
3. Erros. O formato é sempre `{ error:"signature_whatsapp_invalid", message }`, então use a `message` e o status HTTP:
   - 400: "Participante inválido." / "Escolha o número de envio." / "Envio inválido."
   - 404: "Solicitação não encontrada." / "Participante não encontrado."
   - 409: "Este participante não pode receber um link de assinatura." Vale para quem já assinou, para participante automático e para solicitação fora de `sent`/`in_progress` ou sem operação.
   - 403: "Número indisponível ou sem permissão para envio." / "O telefone do contato não corresponde a este signatário. Confira o cadastro antes de enviar."
   - 409: "A configuração mudou. Atualize a prévia antes de enviar." / "O template configurado não está disponível para este número." / "Identificador de envio já utilizado." / "A tentativa falhou. Feche e abra a prévia para tentar novamente." / "Este envio está em processamento ou aguardando confirmação. Confira a conversa antes de reenviar." / "O link já foi enviado. Atualize a prévia e confirme o reenvio." / "O link ou a imagem não correspondem ao template configurado." / "Já existe uma tentativa em andamento. Atualize a prévia e confira a conversa." / "Outro envio foi concluído. Atualize a prévia antes de reenviar."
   - 502: a mensagem de recusa da Meta, ou "Não foi possível confirmar o envio. Confira a conversa antes de tentar novamente."
   - 503: "Não foi possível verificar os envios anteriores." / "Mensagem aceita pelo WhatsApp, mas o registro está pendente. Confira a conversa; não repita o envio."
   - Erros vindos do `get_signing_link` interno chegam como estão, com campo `error` próprio: `participant_already_signed`, `invalid_state`, `rate_limited` (429), `provider_unavailable` (503), `provider_error` (502), `not_configured` (409).
   - A janela de 24h não gera erro, porque o envio sempre usa um template aprovado. Sem telefone não existe erro próprio: o contato não aparece na lista e o envio forçado cai no 403.
- Reenvio: permitido, sem limite e sem intervalo mínimo. Precisa de `resend_of` igual ao último envio enviado. Não pode haver outro envio `pending`/`unknown`, porque um índice único bloqueia. No web, o botão só libera com o checkbox "Reenviar o link...".

## 3) Destinatário
- Regra (`matchesSigningRecipient`): o contato precisa ter telefone com 8 a 15 dígitos.
  - Se o participante tem `phone`, os dígitos precisam ser iguais aos do telefone do contato. O e-mail é ignorado.
  - Se o participante não tem `phone`, o e-mail precisa ser igual, sem diferenciar maiúsculas e minúsculas.
  - O CPF não é usado. Não é preciso ter telefone E e-mail.
- Candidatos, com RLS do usuário: o contato da solicitação (`r.contact_id`) e até 20 contatos da organização com `email ILIKE` igual ao e-mail do participante. Todos passam pela regra acima e chegam ao cliente em `contacts[]` (`id, full_name, email, phone`).
- Se a lista vem vazia, o web mostra "Cadastre um contato com o telefone e o e-mail deste signatário para enviar." e desabilita o envio. Se vem preenchida, mostra um select "Destinatário" com `full_name · phone`. Quando há um único contato, ele já vem selecionado.

## 4) Número de envio
- Lista: `communication_endpoints`, lida com RLS do usuário, com `organization_id` da solicitação, `provider='meta_cloud_api'`, `channel='whatsapp'`, `is_active=true`, `status='online'` e `organization_integration_id` preenchido.
- Também precisam passar `fn_is_sales_eligible_endpoint` (regra de elegibilidade do Comercial, sem filtro literal de `purpose`) e `canUserUseReplyEndpoint` para o usuário.
- Campos devolvidos: `id, display_name, external_address, organization_integration_id, purpose, status`.
- Seleção padrão: se houver só um número elegível, ele já vem escolhido. Caso contrário, o usuário escolhe. Lista vazia: "Nenhum número Meta Cloud disponível no Comercial.".
- O payload usa o `id` do endpoint.

## 5) Template
- O nome não é fixo no código. A configuração fica em `signature_whatsapp_settings` (`template_id`, `header_image_url`, `updated_at`), com uma linha por `organization_integration_id` (conta WABA). O `template_id` aponta para `whatsapp_templates.id`.
- Para valer, o template precisa ter:
  - `provider='meta_cloud_api'`, `status='approved'`, `is_active` e a mesma integração do número;
  - o `purpose` do número dentro de `allowed_purposes`;
  - corpo sem variáveis e cabeçalho TEXT ou IMAGE sem variáveis;
  - exatamente 1 botão URL igual a `https://sign.suvsign.com/s/{{1}}`.
- A prévia é montada no front a partir de `templates[]` do contexto: `body` (com `*negrito*`), `footer`, a imagem `header_image_url` e o texto do botão vindo de `components`. O link nunca vai para a prévia; o servidor resolve no clique final.
- Sem template válido: "Nenhum template configurado para este número." e o botão Enviar fica desabilitado. Para quem não é administrador: "Peça a um administrador para configurar o template desta conta."
- "Configurar template" não abre outra tela. Ele mostra um editor dentro do próprio modal, que chama a action `save_whatsapp_settings` `{request_id, participant_id, endpoint_id, template_id, header_image_url?}` e só aparece para administradores (`can_configure`). No mobile basta mostrar o aviso.

## 6) Permissão
- Não há regra de perfil para enviar. É preciso enxergar a solicitação, o que herda a visibilidade da oportunidade, e ter permissão de usar o número (`canUserUseReplyEndpoint`).
- Configurar o template exige `can_manage_integrations_in_org`, que é o mesmo `can_configure` devolvido no contexto.

## 7) `participant_id`
- É o **`id` (UUID) da linha de `signature_request_participants`**, tanto no `get_signing_link` quanto nas actions de WhatsApp. O `ref` (p1…) dá 400 e o `provider_participant_id` dá 404.
- O envio pelo WhatsApp usa internamente o mesmo `get_signing_link`, então recebe o mesmo link individual, com idempotência por participante.

## Regras de exibição no mobile (iguais ao web)
- Botão e contador só aparecem se a solicitação tem `provider_operation_id` e está em `sent`/`in_progress`. Nunca aparecem para participante automático.
- Para quem já assinou: o botão some e o contador continua.
- Com `pending_count > 0`: mostrar "Há um envio aguardando confirmação..." e o botão "Atualizar status", que chama `get_whatsapp_context` de novo.
