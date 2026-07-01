
# Validação lado Meta do 7027 (`phone_number_id=1285032381352183`)

Não vou mexer em banco nem código. O plano abaixo é só **leitura no lado Meta** (Graph API) + leitura em tabelas de config já existentes. Preciso da sua aprovação porque envolve chamar a Meta com o token da Central.

## O que já sabemos (não Meta, mas relevante)

Do `communication_endpoints` desse número já lido na auditoria anterior:

- `provider = meta_cloud_api`
- `sender_sid` (phone_number_id) = `1285032381352183`
- `external_account_id` (WABA id) = `2206490376764877`
- `organization_integration_id` = `a4036195-13ac-41f3-a77e-90e93c8a0544`
- `metadata.meta.last_validated_at = 2026-06-30T02:52:34Z`
- `metadata.meta.quality_rating = RED` ⚠️
- `metadata.meta.verified_name = Central Trabalhista`
- `status = online`, `is_active = true`
- Migrou de Twilio → Meta em 30/06 02:52 (menos de 36h atrás).

**Sinal amarelo #1:** `quality_rating=RED` no momento da migração. Meta pode aplicar rate limit / entrega restrita a esse phone_number_id quando qualidade fica em RED, principalmente logo após migração.

## Verificações a executar (todas read-only, todas na Meta)

Cada uma responde uma das suas 5 perguntas. Só executo depois da sua aprovação.

### (a) Subscribed apps do WABA — responde perguntas 1 e 4

```
GET /{waba_id}/subscribed_apps
GET /{phone_number_id}?fields=id,display_phone_number,verified_name,
    quality_rating,messaging_limit_tier,platform_type,
    account_mode,code_verification_status,
    name_status,status,throughput,
    is_official_business_account,is_pin_enabled,
    last_onboarded_time,eligibility_for_api_business_global_search
```

- `subscribed_apps.data[]` deve conter o App da Central (mesmo app_id que assina os webhooks).
- Se `data=[]` → **o WABA 2206490376764877 não está inscrito no App** → nenhum webhook seria disparado. Isso explicaria zero webhooks para esse remetente (mas contradiz o fato de estarmos recebendo inbound de OUTROS remetentes no mesmo phone_number_id — a menos que "outros" venham de um WABA/App diferente, o que precisa ser confirmado no passo (d)).

### (b) `platform_type` do phone_number_id — responde pergunta 2

Do mesmo GET acima:

- `platform_type = "CLOUD_API"` → 100% Cloud, sem coexistence.
- `platform_type = "ON_PREMISE"` ou `"NOT_APPLICABLE"` → ainda está em outro lugar.
- Se existir `coexistence` no payload com estado ativo → há WhatsApp Business App ainda plugado no mesmo chip. Nesse caso mensagens locais podem ser absorvidas pelo app e nunca virar webhook.

### (c) Qualidade / limite / status — responde pergunta 3

Do mesmo GET:

- `quality_rating`: hoje registramos `RED`. Se continuar RED, Meta pode estar **restringindo entrega de novas conversas iniciadas por usuário** ou aplicando throttle.
- `messaging_limit_tier`: tier baixo (`TIER_1K` etc.) + RED = risco alto de rejeição silenciosa.
- `status`: `CONNECTED` esperado. Qualquer coisa diferente (`FLAGGED`, `RESTRICTED`, `PENDING`) explica bloqueio.
- `throughput.level`: `STANDARD` normal; `NOT_APPLICABLE` indica número ainda não plenamente ativo na Cloud.
- `code_verification_status`: se `NOT_VERIFIED`, o número está incompleto na Cloud API.

### (d) Confirmar que os inbound de outros contatos realmente estão vindo pelo mesmo phone_number_id — responde parte da pergunta 3/5

```sql
SELECT DISTINCT
  metadata->>'from_phone_number_id' AS pnid,
  count(*) AS n,
  min(created_at), max(created_at)
FROM messages
WHERE endpoint_id='c09bd713-0225-4533-afe8-20ac07bd3a7c'
  AND direction='inbound'
  AND created_at > now() - interval '2 days'
GROUP BY 1 ORDER BY 2 DESC;
```

Isto confirma se todos os inbound recentes desse endpoint realmente entraram pelo mesmo `phone_number_id=1285032381352183` ou se algum roteamento paralelo (Twilio ainda plugado, outro phone_number_id) está entregando os "outros" inbound e o novo 1285032381352183 na verdade não recebe nada. Se o resultado mostrar SIDs no formato `SM...` misturados, é sinal que Twilio ainda está capturando.

### (e) Verify function já existente do próprio Seialz — responde 1+2+3 de uma vez

Já existe `supabase.functions.invoke('meta-whatsapp-verify', { organizationId })` (mapeado em `metaWhatsAppService.verify` — `src/services/metaWhatsAppService.ts`). Ela faz exatamente `validateCredentials()` de `_shared/meta-whatsapp/graph.ts`, que retorna `display_phone_number`, `verified_name`, `quality_rating`, `messaging_limit_tier` e checa `belongs_to_waba`.

Posso chamar essa edge function com `organizationId = 40ae935c…`. Read-only, é a maneira menos invasiva de confirmar o estado atual do 7027 na Meta.

### (f) Painel Meta (Business Manager) — responde pergunta 5

Isto **eu não consigo ler daqui**. Só você. O que precisa olhar:

1. Business Manager → WhatsApp Accounts → Central Trabalhista → **Phone Numbers** → `+55 11 5028-7027`
   - Quality rating atual (bate com RED?)
   - Messaging limit
   - "Restrictions" / "Flagged" banner
2. Business Manager → Business Settings → **Webhooks** → seu App
   - Callback URL apontando para `https://qvmtzfvkhkhkhdpclzua.functions.supabase.co/meta-whatsapp-webhook`?
   - `messages` field está com checkbox marcado?
   - "Recent Deliveries" mostra falha para eventos do phone_number_id 1285032381352183?
3. WhatsApp Manager → Insights → Phone number 7027 → há mensagens **recebidas** hoje (visão da Meta) do remetente `+5511964298621`? Se **sim** e não chegou webhook, o problema é entrega do webhook. Se **não**, a Meta não recebeu a mensagem do seu aparelho (chip, bloqueio, wa_id diferente).

## Hipótese que ficaria confirmada em cada cenário

| Resultado | Diagnóstico |
|---|---|
| (a) `subscribed_apps=[]` no WABA 2206490376764877 | App não assina esse WABA → **nenhum inbound do 7027 gera webhook**. Precisa refazer subscribe. |
| (a) Subscribed OK, mas `messages` field não listado | Faltou marcar o field `messages` no App. Meta manda outros eventos, não manda `messages.messages`. |
| (b) `platform_type != CLOUD_API` ou coexistence ativo | WhatsApp Business App instalado no chip 7027 está absorvendo a mensagem local. Meta Cloud não vê. |
| (c) `status != CONNECTED` ou RED + tier baixo | Meta está restringindo entrega. Explica silêncio para novos remetentes. |
| (d) Inbounds "outros" na verdade têm SID Twilio | Migração incompleta — Twilio ainda roteando os antigos, Cloud não está recebendo nada, incluindo o seu teste. |
| (e) `verify` retorna erro / `belongs_to_waba=false` | Config Cloud está inconsistente (WABA/phone/token). |
| (f) Meta Insights mostra recebida mas webhook não veio | Endpoint webhook não está entregando — checar "Recent Deliveries" no App. |
| (f) Meta Insights NÃO mostra a mensagem | Sua mensagem nunca chegou à Meta — chip/bloqueio/app local. |

## O que preciso da sua aprovação para rodar

- **Executar (e)**: `supabase.functions.invoke('meta-whatsapp-verify', { organizationId: '40ae935c…' })` — apenas leitura no Graph.
- **Executar (a) + (b) + (c)** via `curl` direto no `graph.facebook.com` reutilizando o token já armazenado em `organization_integrations.config_values` da Central (não vou expor o token, só a resposta agregada).
- **Executar (d)** — `SELECT` read-only em `messages`.
- **(f)** fica com você no painel Meta — não tenho acesso.

Se aprovar, faço tudo isso em uma única leitura sem tocar em nada.
