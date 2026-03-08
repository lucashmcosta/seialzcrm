

## Validacao: Captura de Referral CTWA (Click-to-WhatsApp Ads)

### Situacao atual

1. **Webhook de mensagens recebidas** esta na Edge Function `twilio-whatsapp-webhook/index.ts` (rota `/inbound`), no Supabase
2. O webhook **ja recebe o payload do Twilio via formData** (linha 232), mas **nao extrai nenhum campo `Referral.*`**
3. A tabela `contacts` ja tem campos `utm_source`, `utm_medium`, `utm_campaign` e `source` — podem ser reaproveitados
4. **Nao existe nenhuma captura de Referral hoje** — o dado esta sendo ignorado

### O que precisa ser feito

#### 1. Adicionar colunas na tabela `contacts` para dados do anuncio

```sql
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_source_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_headline text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_body text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_media_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_source_id text;  -- ad_id do Meta
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_source_type text; -- "ad"
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS ad_referral_captured_at timestamptz;
```

#### 2. Atualizar o webhook `twilio-whatsapp-webhook` (rota `/inbound`)

Apos a linha 263 (onde extrai `originalRepliedMessageSid`), adicionar extracao dos campos Referral:

```typescript
const referralSourceUrl = params['Referral.SourceUrl'] || null;
const referralHeadline = params['Referral.Headline'] || null;
const referralBody = params['Referral.Body'] || null;
const referralMediaUrl = params['Referral.MediaUrl'] || null;
const referralSourceId = params['Referral.SourceId'] || null;
const referralSourceType = params['Referral.SourceType'] || null;
const hasReferral = !!(referralSourceUrl || referralSourceId);
```

Apos criar/encontrar o contato (bloco linha 323-350), se `hasReferral`, atualizar o contato:

```typescript
if (hasReferral && contactId) {
  await supabase.from('contacts').update({
    ad_referral_source_url: referralSourceUrl,
    ad_referral_headline: referralHeadline,
    ad_referral_body: referralBody,
    ad_referral_media_url: referralMediaUrl,
    ad_referral_source_id: referralSourceId,
    ad_referral_source_type: referralSourceType,
    ad_referral_captured_at: new Date().toISOString(),
    source: 'ctwa',  // marcar origem como Click-to-WhatsApp Ad
    utm_source: 'meta_ads',
    utm_medium: 'ctwa',
  }).eq('id', contactId);
}
```

Tambem logar o referral para debug.

#### 3. Exibir dados do anuncio no ContactDetail

Na pagina de detalhe do contato, exibir uma secao "Origem do Anuncio" quando `ad_referral_source_id` existir, mostrando headline, body e link do anuncio.

### Nota sobre Railway

O webhook principal de mensagens esta **no Supabase** (Edge Function `twilio-whatsapp-webhook`). O Railway e usado para envio e batching, mas o **recebimento** de mensagens inbound passa por esta Edge Function. Entao a captura do Referral deve ser feita aqui.

