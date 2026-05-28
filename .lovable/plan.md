
# Pré-implementação — Backfill Meta Lead Ads Viagi

Antes de qualquer mudança de código ou dados, abaixo está o escopo exato pedido.

---

## 1. Arquivos que vão ser tocados

### Migrations (schema)
- `supabase/migrations/<timestamp>_contacts_attribution_path.sql` — nova coluna + index
- `supabase/migrations/<timestamp>_backup_meta_backfill_2026_05_28.sql` — cria tabela snapshot dos 229 (item 4)

### Edge functions (lógica contínua)
- `supabase/functions/meta-lead-ads-process-lead/index.ts` — refator 3 ramos (A novo / B upgrade / C no-op), grava `attribution_path`, dispara CAPI Lead em A sempre e em B se `lead.created_time >= now()-7d`
- `supabase/functions/_shared/capi-fire.ts` (novo) — helper único para chamar `meta-capi-send-event` com payload `Lead`, isolando lógica da janela 7d e do dedupe

### Backfill (one-shot, **dry-run obrigatório**)
- `supabase/functions/meta-lead-ads-backfill-viagi/index.ts` (novo, descartável) — modos `dry_run` (default) e `apply`. Lê CSV já salvo em storage, processa em lotes de 50, usa `SET LOCAL app.skip_event_emit='true'` por transação, emite relatório JSON com counts e amostra.
- `scripts/upload_viagi_csv.md` (novo) — instrução curta de upload do CSV no bucket `private-imports/`

### UI (zero alteração nesta fase)
Nenhum arquivo em `src/` será tocado. O backfill é server-side puro.

---

## 2. Esquema da nova coluna + migration

### Coluna `contacts.attribution_path`

Semântica: **rastro ordenado** dos canais pelos quais o contato passou, do mais antigo ao mais recente. Append-only. Permite separar "canal de chegada" (`source`) do histórico real.

```text
Tipo:      text[]              (não jsonb — queries com ANY/array_position são triviais)
Default:   ARRAY[]::text[]
Nullable:  false
Valores:   tokens controlados — 'meta_lead_ads' | 'ctwa' | 'whatsapp' |
           'landing_page_viagi' | 'manual' | 'kommo' | 'webhook' | ...
Regra:     novo token só é appended se diferente do último elemento (evita ruído)
Index:     GIN para filtros tipo `WHERE 'meta_lead_ads' = ANY(attribution_path)`
```

### SQL da migration

```sql
ALTER TABLE public.contacts
  ADD COLUMN attribution_path text[] NOT NULL DEFAULT ARRAY[]::text[];

CREATE INDEX idx_contacts_attribution_path
  ON public.contacts USING GIN (attribution_path);

COMMENT ON COLUMN public.contacts.attribution_path IS
  'Rastro ordenado de canais pelos quais o contato passou. Append-only, sem duplicar último elemento. source = chegada inicial; attribution_path = histórico completo.';
```

Sem backfill de dados nessa migration — a coluna nasce vazia. O backfill dos 229 é feito no script (item 3), que popula `attribution_path = ARRAY['ctwa','meta_lead_ads']` (ou equivalente) para os contatos órfãos.

---

## 3. Dry-run obrigatório — output esperado (amostra de 5)

A função `meta-lead-ads-backfill-viagi` exige `{ "mode": "dry_run" }` por default. Só executa UPDATE/INSERT se receber explicitamente `{ "mode": "apply", "confirm_token": "VIAGI_2026_05_28" }`.

### Estrutura do output (JSON)

```json
{
  "mode": "dry_run",
  "organization_id": "b246ef6f-...",
  "totals": {
    "csv_leads": 1297,
    "branch_A_new_contact":   37,
    "branch_B_attribution":  229,
    "branch_C_already_attributed": 1031,
    "capi_lead_within_7d":    18,
    "capi_lead_skipped_old": 248
  },
  "sample_branch_B": [ /* 5 contatos — antes/depois */ ],
  "sample_branch_A": [ /* 5 leads que viram contact novo */ ]
}
```

### Exemplo de uma linha em `sample_branch_B`

```json
{
  "lead_id": "1234567890",
  "contact_id": "c4f1...",
  "before": {
    "source": "ctwa",
    "source_external_id": null,
    "marketing_campaign_id": null,
    "ad_referral_source_id": null,
    "ad_referral_source_type": null,
    "ad_referral_captured_at": null,
    "utm_source": null, "utm_medium": null, "utm_campaign": null,
    "attribution_path": []
  },
  "after": {
    "source": "ctwa",                          // INALTERADO
    "source_external_id": "1234567890",
    "marketing_campaign_id": "a91e...",
    "ad_referral_source_id": "120209876543210",
    "ad_referral_source_type": "lead_form",
    "ad_referral_captured_at": "2026-05-23T14:22:11Z",
    "utm_source": "facebook",
    "utm_medium": "paid_social",
    "utm_campaign": "VIAGI_PROMO_MAIO",
    "attribution_path": ["ctwa","meta_lead_ads"]
  },
  "opportunity": { "action": "reuse_existing", "id": "op_88..." },
  "capi_lead": { "action": "skip", "reason": "lead_created_time_older_than_7d" }
}
```

### Exemplo de `sample_branch_A` (lead totalmente ausente)

```json
{
  "lead_id": "9988776655",
  "action": "insert_contact + insert_opportunity",
  "contact": {
    "full_name": "Maria Souza",
    "phone": "+5511999998888",
    "source": "meta_lead_ads",
    "attribution_path": ["meta_lead_ads"],
    "owner_user_id": "round_robin → u_xx"
  },
  "opportunity": { "pipeline_stage_id": "ps_lead", "amount": 0 },
  "capi_lead": { "action": "fire", "event_time": "2026-05-27T19:11:03Z" }
}
```

---

## 4. Snapshot dos 229 antes do UPDATE

Tabela de backup criada na **mesma migration**, populada com SELECT direto antes do backfill rodar.

```sql
CREATE TABLE public.backup_meta_backfill_2026_05_28_contacts AS
SELECT c.*
FROM public.contacts c
WHERE c.organization_id = 'b246ef6f-…-2896a'
  AND c.deleted_at IS NULL
  AND c.source_external_id IS NULL
  AND c.marketing_campaign_id IS NULL
  AND c.id = ANY (
    -- lista dos 229 IDs derivada do match CSV ↔ contacts por phone normalizado
    SELECT id FROM public.contacts
    WHERE organization_id = 'b246ef6f-…-2896a'
      AND phone = ANY ($1::text[])
      AND deleted_at IS NULL
      AND source IN ('ctwa','whatsapp')
      AND source_external_id IS NULL
  );

GRANT SELECT ON public.backup_meta_backfill_2026_05_28_contacts TO authenticated;
GRANT ALL    ON public.backup_meta_backfill_2026_05_28_contacts TO service_role;
ALTER TABLE  public.backup_meta_backfill_2026_05_28_contacts ENABLE ROW LEVEL SECURITY;
-- sem POLICY = só service_role acessa. Tabela é leitura admin manual.

COMMENT ON TABLE public.backup_meta_backfill_2026_05_28_contacts IS
  'Snapshot completo dos 229 contatos Viagi antes do attribution backfill de 28/05/2026. Restauração: UPDATE contacts SET ... FROM backup_meta_backfill_2026_05_28_contacts WHERE contacts.id = backup....id;';
```

A lista exata de 229 phone numbers vem do CSV que você me passou — vou consolidar no script de backfill e a tabela é populada no `mode=dry_run` (zero risco de mexer em `contacts`).

---

## Pendente — sua aprovação antes de eu rodar a migration

1. Confirma o tipo da coluna `text[]` + index GIN (vs. `jsonb`)?
2. Confirma vocabulário inicial dos tokens: `meta_lead_ads`, `ctwa`, `whatsapp`, `landing_page_viagi`, `manual`, `kommo`, `webhook`?
3. Confirma `confirm_token = "VIAGI_2026_05_28"` para destravar `mode=apply`?
4. Quer que eu inclua na mesma migration o trigger que faz append automático em `attribution_path` quando `source` muda, ou prefere que isso fique 100% no código das edge functions?

Assim que aprovar, rodo migration → upload do CSV → `mode=dry_run` → te mando o JSON real com totais e 10 amostras → você libera `mode=apply`.
