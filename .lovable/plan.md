# Nova função `client-portal-otp-send` (aditiva)

Nada existente é alterado: meta-whatsapp-send, dispatchers, Inbox, templates e demais funções ficam como estão.

## Situação confirmada
- Endpoint 7027 (`c09bd713…`): Meta Cloud, Atendimento, ativo, org Central, integração `a4036195…` (WABA 4877).
- `codigo_acesso_app` existe nessa integração: pt_BR, aprovado, AUTHENTICATION.
- `message_threads` não guarda telefone; o telefone vem de `contacts.phone`. A thread WhatsApp com `last_inbound_at` serve como prova de que o cliente já conversou.

## Fluxo
```text
POST JSON + x-portal-timestamp + x-portal-signature
 -> HMAC-SHA256("{ts}.{corpo bruto}") com tempo constante, janela de 300 s  (falha = 401 unauthorized)
 -> valida: code com 6 dígitos; 1 a 5 UUIDs  (400 invalid_input)
 -> contatos da org configurada, sem deleted_at
 -> elegível: contato com telefone + thread whatsapp com last_inbound_at;
    usa o contato/telefone da thread mais recente
    (nenhum = 200 {sent:false, reason:"no_verified_whatsapp"})
 -> limite: 5 envios/hora por contato no log de auditoria (429 rate_limited)
 -> endpoint fixo pelos secrets; recusa 407ff93d… explicitamente; exige endpoint ativo da org
 -> resolveMetaCredentials(integração do endpoint) -> POST /{phone_number_id}/messages
 -> grava client_portal_otp_log (sem código)
 -> 200 {sent:true, destination_masked:"(11) *****-1234", meta_message_id}
```
- Payload: template `codigo_acesso_app`, idioma do registro (pt_BR); componente body com parâmetro text = code; componente button com sub_type `url`, index `"0"` e parâmetro text = code.
- Nenhuma escrita em message_threads ou messages. O código, o telefone completo e o corpo da requisição não aparecem em nenhum log. Os erros só trazem `{code}`.
- Uma falha na Meta também entra no log com status `failed` e retorna 502 `{code:"send_failed"}`. Ela conta para o limite de envios.

## Migration (será mostrada antes de aplicar)
```sql
CREATE TABLE public.client_portal_otp_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  contact_id uuid NOT NULL REFERENCES public.contacts(id),
  phone_last4 text,
  meta_message_id text,
  status text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX client_portal_otp_log_rate_idx ON public.client_portal_otp_log (contact_id, created_at DESC);
GRANT ALL ON public.client_portal_otp_log TO service_role;
ALTER TABLE public.client_portal_otp_log ENABLE ROW LEVEL SECURITY;
-- sem policies e sem grants para anon/authenticated: só a função (service_role) lê e grava
```

## Arquivos
- `supabase/functions/client-portal-otp-send/index.ts`: cuida só da entrada HTTP e do fluxo.
- `supabase/functions/client-portal-otp-send/logic.ts`: funções puras (assinatura, validação, escolha do telefone, máscara, payload).
- `supabase/functions/client-portal-otp-send/logic_test.ts`: testes Deno de assinatura (válida, inválida, expirada), validação de entrada, telefone elegível e payload com o código no body e no botão.
- `supabase/config.toml`: bloco `[functions.client-portal-otp-send] verify_jwt = false`.

## Secrets
- `CLIENT_PORTAL_ORGANIZATION_ID`, `CLIENT_PORTAL_OTP_ENDPOINT_ID` e `CLIENT_PORTAL_OTP_TEMPLATE`: gravados com os valores fixos informados.
- `CLIENT_PORTAL_HMAC_SECRET`: não será gerado. Você recebe um formulário seguro para colar o valor, que precisa ser o mesmo usado no backend do app de clientes. Sem ele, a função responde 401 em todas as chamadas.

## Entrega
Lista de arquivos, a migration antes de aplicar, resultado dos testes, URL da função (`https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/client-portal-otp-send`) e os nomes dos secrets. Não haverá envio real de teste a um cliente.
