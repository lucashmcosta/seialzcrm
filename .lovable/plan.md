
# Diagnóstico — Lindinalva Reis

Análise read-only. Nada a implementar.

## 1. Como ela entrou (não entrou por WhatsApp)

O contato **não chegou por mensagem inbound de WhatsApp em nenhum número**. Ela veio de **Meta Lead Ads (formulário do Facebook)**:

- `contacts.source = meta_lead_ads`
- `contacts.utm_source = facebook`
- `contacts.utm_campaign = LEADS > FORMS`
- `ad_referral_source_type = lead_form` / `ad_referral_source_id = 120244018747560243`
- `contacts.created_at = 2026-07-23 02:55:05Z` (~00h no fuso local, madrugada)
- Oportunidade criada no mesmo instante: `Lindinalva Reis — VIAGI HIGH INTENT FORM` (`source=meta_lead_ads`, `source_external_id=1345999647111289`).

A thread WhatsApp (`8573606b-…`) só foi criada **~11h depois**, em `2026-07-23 14:16:12Z`, no exato momento em que a Marlisa enviou o primeiro toque. `last_inbound_at = NULL` — a cliente nunca respondeu / nunca escreveu primeiro.

Ou seja: o badge **"Novo · 2890"** na lista **não significa que ela mandou mensagem pelo 2890**. Significa apenas que a thread foi criada com `primary_endpoint_id = 2890` (Meta Cloud, `+551150262890`) porque essa era a linha padrão de saída comercial no momento da criação (e continua sendo o "histórico" da thread).

## 2. Por qual número saiu a resposta da Marlisa

Saiu pelo **Evolution 8439** (`+5511936198439`), **não** pelo 2890 exibido no header.

Evidência direta na única mensagem da thread (`560fe162-…`):
- `endpoint_id = 11111111-e701-4a01-8000-000000000001` → endpoint Evolution `+5511936198439` (`provider=evolution_api`, `purpose=commercial`).
- `whatsapp_message_sid = 3EB0A09E95E8CD9B1E432F` → formato `3EB0…` é wamid **Baileys/Evolution**. Meta Cloud emite `wamid.HBg…` e Twilio emite `SM…/MM…`. Não há como esse ID ter saído do 2890.
- `whatsapp_status = sent`, `sent_at = 14:16:15Z`.
- `direction = outbound`, `sender_type = user` (envio manual pelo CRM, não agente).

## 3. Por que o header mostra "2890" se saiu pelo 8439

É exatamente o modelo de **linha ativa vs. endpoint histórico** que restauramos:

- `message_threads.primary_endpoint_id = 34d9ec9d-…` → 2890 (Meta). É o "carimbo" histórico da thread — nunca é reescrito no envio, é só o número que a thread "nasceu vinculada". Por isso o badge da lista e o subheader mostram **Novo · 2890 · Meta Cloud API**.
- `messaging_lines` da organização:
  - `commercial → 11111111-…-0001` (Evolution 8439)
  - `evolution_pilot → 11111111-…-0001` (Evolution 8439)
  - `customer_service → 03bdcb91-…` (Meta 2896)
- O composer resolve o envio por **business_context → purpose → linha ativa → capability**. Como a thread é `business_context=sales` e a linha `commercial` aponta para o Evolution 8439 (`requires_template_outside_window=false`), o composer:
  1. libera texto livre mesmo com `last_inbound_at = NULL` (sem janela de 24h);
  2. despacha para `evolution-whatsapp-send` com `endpointId` explícito do 8439;
  3. persiste `messages.endpoint_id = 8439` (é a fonte de verdade do que saiu).

O rodapé do composer confirma isso na tua screenshot: **"Sem inbound recente — envio livre pelo número ••••8439"**.

## 4. Resumo em uma linha

Lindinalva entrou por **Meta Lead Ads** (formulário, sem WhatsApp inbound); a thread nasceu carimbada como **2890 (Meta)** apenas como histórico; a resposta da Marlisa saiu de fato pelo **Evolution 8439** — comprovado por `endpoint_id`, formato do `wamid` (`3EB0…`) e pela linha ativa `commercial` da organização.

## 5. Observação (não é ação, é dado)

Se te incomoda o header da conversa dizer "2890 · Meta Cloud API" enquanto o envio real é pelo 8439, isso é um **descolamento de UI**, não de dado. Já discutimos as opções antes (atualizar o header para refletir a linha ativa quando ela diverge do primary; ou manter primary como histórico e adicionar uma linha "enviando por 8439" no header). Só sinalizando — não estou propondo mudar nada agora.
