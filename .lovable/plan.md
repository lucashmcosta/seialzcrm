## Causa raiz

Os logs da edge `meta-lead-ads-process-lead` mostram erro `23505` (unique violation em `uniq_contacts_org_phone_normalized`) para 2 leads recentes do CT FORM. A função aborta no `INSERT` do contato e nunca chega no bloco de envio do template WhatsApp.

A dedup atual depende de `organizations.duplicate_check_mode`. Quando está `none` (ou `email`), o telefone não é checado, mas o banco tem unique constraint em `phone_normalized` — então o insert falha.

## Correção (mínima e cirúrgica)

**Arquivo:** `supabase/functions/meta-lead-ads-process-lead/index.ts`

1. **Fallback de dedup por telefone** — antes do `INSERT` do contato, se ainda não temos `existingId` e há `phone`, fazer um lookup adicional por `phone` (mesma org, `deleted_at is null`). Se achar, tratar como contato existente (mesmo caminho do `existingId`). Isso evita o 23505 e mantém o comportamento esperado: contato duplicado → não dispara template (já existia).

2. **Tratamento defensivo do 23505** — envolver o `INSERT` num try/catch que, em caso de `code === '23505'`, refaz o `select` por `(organization_id, phone)` e segue com o `contactId` recuperado (sem disparar template, pois não é "primeiro contato"). Garante que mesmo race conditions não derrubem a função.

3. **2 logs de observabilidade** no bloco de auto-WhatsApp:
   - `console.log("[auto-wa] eval", { isNew: !existingId, hasPhone: !!phone, autoSend: settings?.auto_send_whatsapp, tplId: settings?.whatsapp_template_id })`
   - Log do status da resposta do `twilio-whatsapp-send`.

## O que NÃO muda

- Nenhuma alteração na lógica de mapeamento, owner, oportunidade, tags, custom fields, activity ou name confirmation.
- Nenhuma migration. A constraint do banco continua válida (é correta — protege duplicados).
- Settings, payload e contrato da função permanecem idênticos.

## Validação pós-deploy

- Próximo lead novo do CT FORM (telefone inédito): deve criar contato + disparar template; log `[auto-wa] eval` deve mostrar `isNew: true`.
- Próximo lead com telefone já existente: deve atualizar contato, **não** disparar template, sem 500.
- Conferir `messages` com `sender_name = "Meta Lead Ads (auto)"` e logs da `twilio-whatsapp-send`.
