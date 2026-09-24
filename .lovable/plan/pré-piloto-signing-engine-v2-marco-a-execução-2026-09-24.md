# Pré-piloto Signing Engine V2 — Marco A (execução)

O modo atual só me deixa agir depois da sua aprovação. Ao aprovar, executo tudo abaixo direto e só volto com o relatório final nos 10 itens pedidos.

## 1. Resend — `delivered_at` ponta a ponta
Antes de mexer em qualquer configuração, confiro nesta ordem:
1. No código: se a V1 já usa `resend-webhook-handler` e como ele valida o secret.
2. No banco e nos logs: se ele já recebe eventos do Resend em produção.
3. Se já existe endpoint configurado para `https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/resend-webhook-handler`.
4. Se `RESEND_WEBHOOK_SECRET` já existe no ambiente (confiro só se existe, sem ler o valor).

O que faço em cada caso:
- **Endpoint já existe:** reuso o atual, sem criar outro e sem trocar o secret. Só confirmo que `email.delivered` e os demais eventos da V2 estão ligados. O handler passa a separar V1 e V2 pelo `resend_email_id`, e a V1 continua exatamente igual.
- **Endpoint não existe:** paro e te passo as instruções abaixo. Você cola o secret direto no Supabase, sem passar pelo chat.
- **Vários endpoints com secrets diferentes:** paro e te mostro a situação exata, sem alterar nada.

Instruções (só se for preciso criar):
- Resend → Webhooks → Add Endpoint, com a URL acima.
- Eventos: `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.opened`.
- Signing Secret: no endpoint → Reveal/Copy (começa com `whsec_`).
- Supabase → Edge Functions → Secrets: `RESEND_WEBHOOK_SECRET`.

Com isso resolvido, faço o teste: convite V2 real e conferência de `resend_email_id`, Svix válido, `provider_event_id`, `applied=true`, `delivered_at`, replay sem duplicar, contador "Entregue" de 0 para 1, `opened` diferente de `document_viewed` e V1 sem mudança.

## 2. HMAC com um único webhook QA
- Desativar os webhooks QA duplicados e criar um único webhook QA com um único secret conhecido pelo sink.
- Disparar um `document.completed` real.
- Validar: payload recebido, HMAC legado, formato novo (se houver), `signed_file_url` baixável, retry com o mesmo event id e nenhum evento de domínio novo.
- Se der `false`, comparo o secret e o body canônico entre o emissor e o sink até achar a divergência.
- No fim, remover o webhook QA e a chave QA.

## 3. Documentação (baseada no código publicado)
- ADR: `docs/decisions/0011-signing-engine-v2.md`, mais a linha no índice `docs/decisions/README.md`.
- Spec da API: `docs/reference/api/signing-engine-v2.md`, com endpoints, contratos e erros tirados do router real, incluindo `409 signing_engine_v2_not_enabled`.

## 4. Estado final
- Atualizar `roadmap.md`. Marco A fica CONCLUÍDO só se os itens 1 e 2 passarem. Piloto LIVE: NÃO INICIADO. Telas `telas-png/` e `telas-html/` continuam pendentes.
- Conferir no banco: regras live = 0, regras shadow temporárias = 0, webhooks/chaves QA = 0 e os crons do worker, do dispatcher e do shadow ativos.

Fora do escopo: arquitetura, V1, regras live, piloto e telas.
