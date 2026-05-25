## Contexto

Olhei o banco e a notícia é boa: muitos leads antigos **já têm sinais de atribuição salvos**, só não estão vinculados ao registro do anúncio (`marketing_campaign_id`). Hoje temos, dos 16.779 contatos ativos:

- 1.548 já vinculados a um anúncio
- 1.751 com `ad_referral_source_id` (ID do anúncio CTWA do Meta)
- 1.970 com `utm_campaign`
- 826 com headline do anúncio capturado
- 784 com `ctwa_clid`

Dos que **ainda não estão vinculados**:
- **250** têm CTWA `ad_referral_source_id` que bate exatamente com um anúncio já existente em `marketing_campaigns` → vínculo 100% confiável
- **273** dão match por nome de UTM (campaign/adset/ad name) → vínculo bom, com leve risco de homônimo
- O restante tem só UTM genérico ou nada útil

## Proposta

Fazer um **backfill** retroativo em duas camadas, da mais segura para a menos segura, e expor o resultado no detalhe do contato/lead para você ver se veio de LP, formulário do Meta, ou orgânico.

### Camada 1 — Match exato por CTWA ad id (alta confiança)
Para todo contato com `marketing_campaign_id IS NULL` e `ad_referral_source_id` preenchido, achar o `marketing_campaigns` da mesma organização cujo `ad_id` (ou `external_id`) é igual e gravar o vínculo. Estimado: **~250 leads** vinculados de cara.

### Camada 2 — Match por nome de UTM (média confiança)
Para os restantes com UTM, casar `utm_campaign`/`utm_content` com `campaign_name`/`adset_name`/`ad_name` dentro da mesma organização. Quando houver mais de um candidato, **não vincular** (evita falso positivo). Estimado: **~273 leads** adicionais.

### Origem (LP vs Form)
Já dá pra inferir hoje, sem coluna nova, usando os campos existentes:

- `ad_referral_source_type = 'lead_ad'` ou presença de `ad_referral_source_id` vindo do Meta Lead Ads → **Formulário do Meta**
- `ad_referral_ctwa_clid` preenchido → **Click-to-WhatsApp (anúncio que abre conversa)**
- `referrer_url` ou `utm_source` apontando pro domínio do site → **Landing Page**
- Sem nada disso → **Orgânico/Direto**

Vou adicionar uma função utilitária no frontend que retorna esse rótulo a partir do contato e mostrar no cabeçalho da página de detalhe do contato/lead, junto com o link para o anúncio vinculado (quando houver).

## Entregáveis

1. **Migration de backfill** (executa uma vez):
   - Update em `contacts` setando `marketing_campaign_id` pela Camada 1
   - Update em `contacts` setando `marketing_campaign_id` pela Camada 2 (só quando houver match único)
   - Log do total atualizado no console da migration

2. **Edge function `backfill-attribution`** opcional (pra rodar de novo quando novos anúncios forem sincronizados do Meta, recuperando matches que antes não existiam). Disparada manualmente em Admin → Integrações.

3. **Frontend**:
   - Helper `getLeadOrigin(contact)` que devolve um dos rótulos: *Formulário Meta*, *Click-to-WhatsApp*, *Landing Page*, *Orgânico*
   - Badge de origem + link "Ver anúncio" no header do `ContactDetail`
   - Mesma badge na lista de leads do anúncio (`useAdLeads`) pra você bater olho rápido

## Fora do escopo

- Não vou alterar o fluxo de captura novo (já funciona). Foco é só recuperar o histórico.
- Não vou tentar adivinhar atribuição de lead sem nenhum sinal — esses ficam como *Orgânico*.

## Detalhes técnicos

```sql
-- Camada 1
UPDATE contacts c
SET marketing_campaign_id = mc.id
FROM marketing_campaigns mc
WHERE c.marketing_campaign_id IS NULL
  AND c.deleted_at IS NULL
  AND c.ad_referral_source_id IS NOT NULL
  AND mc.organization_id = c.organization_id
  AND (mc.ad_id = c.ad_referral_source_id OR mc.external_id = c.ad_referral_source_id);

-- Camada 2: só quando houver exatamente 1 candidato
WITH candidates AS (
  SELECT c.id AS contact_id, mc.id AS campaign_id,
         COUNT(*) OVER (PARTITION BY c.id) AS n
  FROM contacts c
  JOIN marketing_campaigns mc ON mc.organization_id = c.organization_id
   AND (mc.ad_name = c.utm_content
     OR mc.adset_name = c.utm_content
     OR mc.campaign_name = c.utm_campaign)
  WHERE c.marketing_campaign_id IS NULL AND c.deleted_at IS NULL
)
UPDATE contacts c SET marketing_campaign_id = ca.campaign_id
FROM candidates ca WHERE ca.contact_id = c.id AND ca.n = 1;
```

Confirma que pode seguir?
