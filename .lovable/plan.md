# Plano: Atribuição completa de leads (Viagi LP + Meta CAPI)

## Objetivo
Fechar os gaps de atribuição identificados na auditoria sem inventar tabelas novas. O schema já tem quase tudo — o problema é que o `lead-webhook` descarta campos críticos e o `meta-capi-send-event` lê colunas que não existem.

## Escopo
3 correções cirúrgicas + 1 migration mínima + UI de diagnóstico read-only + teste end-to-end.

---

## Mudanças

### 1. Migration: adicionar colunas faltantes em `contacts`
Apenas o estritamente necessário para o CAPI funcionar e para reter o adset:

- `fbclid_captured_at timestamptz` — timestamp original da captura do clique (CAPI gera `fbc` com isso)
- `meta_lead_id text` — id do lead vindo do Meta Lead Ads (deduplicação CAPI)
- `meta_adset_id text` — id do adset (hoje só sobrevive na nota)
- `meta_campaign_id text` — id da campanha Meta (idem)
- Índices: `(meta_adset_id)`, `(meta_campaign_id)`, `(meta_lead_id)` parcial onde não nulo

Sem alterar `marketing_campaigns` — a resolução continua via `fn_resolve_marketing_campaign_id()`.

### 2. Patch em `supabase/functions/lead-webhook/index.ts`
Ler do payload (raiz) e persistir:

- `fbclid` → `contacts.fbclid` + `fbclid_captured_at = now()` quando presente
- `gclid` → `contacts.gclid` (remover trigger hardcoded por org como follow-up futuro, fora deste plano)
- `utm_id` → `contacts.meta_adset_id` (Meta envia adset_id em `utm_id`)
- `utm_term` continua mapeando `ad_id` (já funciona)
- Extrair `adset_id`, `campaign_id`, `placement` de `all_params` (se vier) → `meta_adset_id`, `meta_campaign_id` (sem sobrescrever se já setado por `utm_id`)
- Chamar `fn_resolve_marketing_campaign_id()` passando agora também `meta_adset_id` para melhorar match

### 3. Patch em `supabase/functions/meta-lead-ads-process-lead/index.ts`
Gravar `meta_adset_id`, `meta_campaign_id`, `meta_lead_id` no contato (hoje só grava `ad_referral_source_id`).

### 4. Patch em `supabase/functions/meta-capi-send-event/index.ts`
Já lê `fbclid_captured_at` e `meta_lead_id` — após a migration, esses campos passam a existir e o `fbc` será gerado com timestamp real (não mais `Date.now()` fake).

### 5. UI de diagnóstico (read-only) em `ContactDetail.tsx`
Card "Atribuição" mostrando: `source`, todos `utm_*`, `fbclid`, `gclid`, `meta_adset_id`, `meta_campaign_id`, `referrer_url`, `landing_url`, link para `marketing_campaigns` resolvida. Só leitura, ajuda você a auditar visualmente cada lead.

### 6. Teste end-to-end
Após deploy, chamar `lead-webhook` via `supabase--curl_edge_functions` com payload idêntico ao "Teste E2E Viagi" e validar via SQL que:
- `fbclid`, `gclid`, `fbclid_captured_at` populados
- `meta_adset_id` = `ADSET_TESTE_222`
- `meta_campaign_id` = `CAMP_TESTE_333`
- `marketing_campaign_id` resolvido (se houver match) ou ambiguidade logada

---

## Detalhes técnicos

**Por que não criar `marketing_params jsonb`**: o schema já é relacional e rico. Adicionar JSONB seria duplicar dado que vai pra colunas indexadas. Mantemos relacional.

**Por que não usar `utm_id` como coluna**: Viagi (e Meta no geral) usa `utm_id` semanticamente como adset_id. Nomear `meta_adset_id` é mais claro para queries de ROAS por adset e evita confusão com IDs de outras plataformas.

**Ordem de execução**:
1. Migration (aprovação do usuário)
2. Patches dos 3 edge functions (deploy automático)
3. UI card de atribuição
4. Curl de teste + leitura SQL pra validar
5. Reportar resultado

## Fora de escopo (follow-up futuro)
- Remover trigger hardcoded de `gclid` por org
- UI admin de resolução de `marketing_attribution_ambiguities`
- Backfill de leads históricos com `meta_adset_id` a partir das notas
