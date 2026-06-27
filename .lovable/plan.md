## Contexto

- Envio (CRM → WhatsApp) voltou a funcionar após atualização do `META_WHATSAPP_APP_SECRET` e reemissão/atualização do System User Token.
- Recebimento (WhatsApp → CRM) **não funciona**: os logs da edge function `meta-whatsapp-webhook` mostram apenas `booted`/`Listening` — **nenhum POST do Meta nas últimas horas**.
- Nenhuma mensagem inbound foi gravada nos endpoints `meta_cloud_api` da organização Central Trabalhista (`sender_sid` 616542954869698 e 1230513500138599).
- Usuário confirma:
  1. Callback URL aponta para `/meta-whatsapp-webhook`
  2. Verify token bate com `META_WHATSAPP_VERIFY_TOKEN`
  3. WABA inscrita em "Subscribed Apps"

Como o verify passou (precisa do secret) e mesmo assim nenhum POST chega, o problema está antes do nosso código: ou a URL salva no Meta App não é exatamente a nossa, ou a inscrição no WhatsApp Business Account não está cobrindo o campo `messages` do número certo. Precisamos de evidência de que algum POST chega — hoje não conseguimos diferenciar "Meta não chamou" de "Meta chamou e nosso código rejeitou silenciosamente".

## Objetivo

Provar, em uma única rodada de teste, se o Meta está ou não enviando POST para `meta-whatsapp-webhook`. A partir disso, escolher a correção (corrigir URL/inscrição no Meta App **ou** ajustar nosso código).

## Plano

### 1. Instrumentar `meta-whatsapp-webhook` com log de entrada (não-sensível)

Adicionar um único `console.log` no topo do handler **antes** da validação de assinatura. Loga apenas:

- `method`
- `has_x_hub_signature_256` (boolean)
- `content_length`
- `phone_number_ids` extraídos do payload (sem o conteúdo da mensagem)
- `signature_match` (boolean, calculado mas sem expor a assinatura)

Nada de body cru, nada de números de telefone do contato, nada de texto.

Objetivo: qualquer POST do Meta passa a aparecer no log de Edge Functions, mesmo que falhe a validação HMAC.

### 2. Redeploy de `meta-whatsapp-webhook`

Deploy isolado, sem mexer em mais nada.

### 3. Teste guiado

Pedir ao usuário para enviar 1 mensagem do celular pessoal para **+16893077491** (sandbox) e 1 para **Central Trabalhista (1230513500138599)** — assim cobrimos os dois `sender_sid`.

### 4. Ler os logs e decidir

Três cenários:

- **(A) Nenhum POST aparece** → problema está no Meta App: a callback URL salva não é a nossa (provavelmente sobrou URL antiga de outro ambiente) **ou** a WABA está inscrita no app errado / sem o campo `messages`. Próximo passo: o usuário abre WhatsApp Manager → Account Tools → Webhooks, e me manda screenshot da Callback URL exata e da lista de Subscribed Apps + fields. Eu comparo com a URL esperada `https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-whatsapp-webhook` e oriento a correção.
- **(B) POST chega mas `signature_match=false`** → `META_WHATSAPP_APP_SECRET` ainda não é o App Secret do app dono do webhook. Próximo passo: confirmar o App ID que está enviando o webhook e atualizar o secret novamente.
- **(C) POST chega, assinatura OK, mas `phone_number_id` não bate com nenhum `communication_endpoints.sender_sid`** → o número configurado no Meta é diferente do que está salvo no endpoint da organização. Próximo passo: atualizar `sender_sid` do endpoint ou reconectar pela UI.

### 5. Remover os logs de diagnóstico

Depois que o recebimento estiver provado funcionando, removo o `console.log` adicionado no passo 1 (mantém o webhook silencioso em produção).

## Detalhes técnicos

- Arquivo alterado: `supabase/functions/meta-whatsapp-webhook/index.ts` (apenas um bloco `console.log` no início do handler POST e variável auxiliar para `signature_match`).
- Sem migrations, sem mudanças de UI, sem mexer em `meta-whatsapp-send`.
- Sem remover `appsecret_proof` (regra do usuário mantida).
- Não aplicar Opção B.

## Fora de escopo

- Reescrever lógica de `handleInbound`/`handleStatus`.
- Mexer em `twilio-whatsapp-webhook`.
- Mudar política de RLS de `messages`/`message_threads`.