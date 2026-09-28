import { normalizeLeadAttribution, leadCommercialEvidence } from "./lead-attribution.ts";

function equal(actual: unknown, expected: unknown) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(JSON.stringify({ actual, expected }));
}

Deno.test("LP Rescisão preserves nested UTMs and raw Meta hierarchy without copying form answers", () => {
  const data = normalizeLeadAttribution({
    source: "meta", utms: { utm_source: "meta", utm_medium: "paid", utm_campaign: "LEADS > LP", utm_content: "1 - Demissao" },
    all_params: { raw: { ad_id: "120251293733850592", adset_id: "120251293733860592", campaign_id: "120251293733870592" }, salario_base: 2000, session_id: "private", fbclid: "click" },
  });
  equal(data, { source: "meta", utm_source: "meta", utm_medium: "paid", utm_campaign: "LEADS > LP", utm_content: "1 - Demissao", fbclid: "click", meta_ad_id: "120251293733850592", meta_adset_id: "120251293733860592", meta_campaign_id: "120251293733870592" });
  equal(leadCommercialEvidence(data).ad_id, "120251293733850592");
});
Deno.test("mapped top-level fields win; JSON-string all_params remains supported", () => {
  equal(normalizeLeadAttribution({ utm_campaign: " mapped ", utms: { utm_campaign: "nested" }, all_params: JSON.stringify({ utm_source: "google", gclid: "g", raw: { campaign_id: "123" } }) }),
    { utm_source: "google", utm_campaign: "mapped", gclid: "g", meta_campaign_id: "123" });
});
Deno.test("optional malformed data and unresolved ad templates never become attribution", () => {
  for (const all_params of [null, "null", "[]", "invalid", [], 42]) equal(normalizeLeadAttribution({ all_params }), {});
  equal(normalizeLeadAttribution({ utms: { utm_campaign: "{{campaign.name}}", utm_source: [], utm_medium: 123 }, all_params: { raw: { ad_id: "{{ad.id}}", utm_source: "meta" } } }), { utm_source: "meta" });
});
Deno.test("separate submissions never inherit another contact's attribution", () => {
  normalizeLeadAttribution({ source: "meta", utms: { utm_campaign: "previous" } });
  equal(leadCommercialEvidence(normalizeLeadAttribution({ source: "gads", gclid: "new" })), { source: "gads", gclid: "new" });
});
