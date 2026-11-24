import { cleanVisit } from "./site-pixel.ts";

function assert(cond: unknown, msg: unknown) { if (!cond) throw new Error(JSON.stringify(msg)); }
const vid = "v0123456789abcdef0123456789abcdef";

Deno.test("keeps only tracking params and the referrer domain", () => {
  const v = cleanVisit({ vid, url: "https://www.loja.test/lp?utm_source=google&utm_medium=cpc&gclid=G1&email=x@y.test", ref: "https://www.google.com/search?q=segredo" })!;
  assert(v.landingUrl === "https://www.loja.test/lp?utm_source=google&utm_medium=cpc&gclid=G1", v);
  assert(v.evidence.referrer_url === "https://www.google.com/" && v.referrerHost === "www.google.com", v);
  assert(!("site_entry" in v.evidence) && v.evidence.gclid === "G1", v);
});

Deno.test("same-site navigation counts as direct", () => {
  const v = cleanVisit({ vid, url: "https://loja.test/precos", ref: "https://www.loja.test/" })!;
  assert(v.referrerHost === null && v.evidence.site_entry === "direct", v);
});

Deno.test("drops empty Meta macros and bad cookies; rejects bad input", () => {
  const v = cleanVisit({ vid, url: "https://loja.test/?utm_source=fb&utm_campaign={{campaign.name}}", fbp: "fb.1.1700000000000.123456", fbc: "<script>" })!;
  assert(v.evidence.utm_source === "fb" && !v.evidence.utm_campaign && v.evidence.fbp && !v.evidence.fbc, v);
  assert(cleanVisit({ vid: "x", url: "https://loja.test/" }) === null, "short vid");
  assert(cleanVisit({ vid, url: "javascript:alert(1)" }) === null, "bad url");
});
