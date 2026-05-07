## Code Review Fixes — Meta Lead Ads (3 functions)

Aplicar 6 correções, na ordem abaixo. Sem migrations, sem novos secrets, sem mudanças de frontend ou helpers compartilhados. Após o deploy, retorno para revisão final.

Nota: `lead.ad_id` e `lead.ad_name` são propriedades planas do objeto retornado pela Graph API, sem URL — apenas artefato de markdown na conversa.

---

### Arquivo 1 — `supabase/functions/meta-lead-ads-poll/index.ts`

**Fix 1A — Auth check (logo após OPTIONS, antes do `try`):**
```ts
const authHeader = req.headers.get("authorization");
const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
if (authHeader !== expected) {
  return json({ error: "Unauthorized" }, 401);
}
```

**Fix 3 — Fields completos no fetch de leads (linha 88):**
```ts
fields:
  "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,form_id,platform,is_organic",
```

---

### Arquivo 2 — `supabase/functions/meta-lead-ads-token-health/index.ts`

**Fix 1B — Auth check (mesmo bloco, após OPTIONS).**

---

### Arquivo 3 — `supabase/functions/meta-lead-ads-process-lead/index.ts`

**Fix 6 — `option_as_tag` no switch de tags (substitui o `case "tag"` atual, linhas 85-96):**
```ts
case "tag": {
  const strat = q.tag_strategy || "value_as_tag";
  if (strat === "fixed_tag" && q.fixed_tag_id) {
    tagOps.push({ tag_id: q.fixed_tag_id });
  } else if (strat === "option_as_tag") {
    const opts = String(value).split(",").map((s) => s.trim()).filter(Boolean);
    for (const opt of opts) {
      tagOps.push({
        name: q.tag_prefix ? `${q.tag_prefix}${opt}` : opt,
        color: q.tag_color,
      });
    }
  } else if (strat === "value_with_prefix") {
    tagOps.push({ name: `${q.tag_prefix || ""}${value}`, color: q.tag_color });
  } else {
    tagOps.push({ name: value, color: q.tag_color });
  }
  noteLines.push(`${q.field_label}: ${value}`);
  break;
}
```

**Fix 4 — UTM + atribuição com timestamp real no INSERT do contato (linhas 204-206):**
```ts
utm_source: "facebook",
utm_medium: "paid_social",
utm_campaign: lead.campaign_name || null,
ad_referral_source_id: lead.ad_id || null,
ad_referral_source_type: "lead_form",
ad_referral_captured_at: lead.created_time || new Date().toISOString(),
```

**Fix 5 — Activity body com nomes legíveis e `occurred_at` real (linhas 270-277):**
```ts
body:
  `=== Atribuição ===\n` +
  (lead.campaign_name ? `Campanha: ${lead.campaign_name}\n` : "") +
  (lead.adset_name ? `Conjunto: ${lead.adset_name}\n` : "") +
  (lead.ad_name ? `Anúncio: ${lead.ad_name}\n` : "") +
  (lead.platform
    ? `Plataforma: ${lead.platform === "fb" ? "Facebook" : "Instagram"}\n`
    : "") +
  `\n=== Respostas ===\n${noteLines.join("\n") || "(sem respostas)"}` +
  (unmappedFields.length
    ? `\n\nCampos não mapeados: ${unmappedFields.join(", ")}`
    : ""),
occurred_at: lead.created_time || new Date().toISOString(),
```

**Fix 2 — Remover `facts: {}` do upsert de `contact_memories` (linhas 298-308):**
```ts
await admin.from("contact_memories").upsert(
  {
    organization_id,
    contact_id: contactId,
    name_confirmed: true,
    name_confirmed_at: new Date().toISOString(),
    name_asked: true,
  },
  { onConflict: "contact_id" },
);
```
Sem `facts`, sem `.select()`. INSERT usa default `'[]'::jsonb`; UPDATE preserva facts existentes.

---

### Deploy & verificação

Após os edits, deploy das 3 functions: `meta-lead-ads-poll`, `meta-lead-ads-token-health`, `meta-lead-ads-process-lead`. Retorno confirmando para revisão final.
