import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { buildReferralContactUpdate, parseCloudApiReferral } from "./ctwa-referral.ts";

// Amostras SANITIZADAS no formato real do webhook Cloud API (messages[0]) — mesmas chaves
// observadas em prod em 07/11/2026; ids/textos trocados.
const msgWaMe = {
  from: "5500000000000", id: "wamid.TEST1", timestamp: "1800000000", type: "text",
  text: { body: "Olá" },
  referral: {
    source_url: "https://wa.me/550000000000", source_id: "120000000000000001", source_type: "ad",
    headline: "Headline", media_type: "image", image_url: "https://example.invalid/img.jpg",
  },
};
const msgFbMe = {
  from: "5500000000000", id: "wamid.TEST2", timestamp: "1800000001", type: "text",
  text: { body: "Olá" },
  referral: {
    source_url: "https://fb.me/abcdef", source_id: "120000000000000001", source_type: "ad",
    headline: "Headline", body: "Body", media_type: "image", image_url: "https://example.invalid/img.jpg",
    ctwa_clid: "ARAkTESTCLID",
  },
};

Deno.test("parse: referral wa.me sem ctwa_clid (formato que a Meta manda)", () => {
  const r = parseCloudApiReferral(msgWaMe)!;
  assertEquals(r.ctwa_clid, null);
  assertEquals(r.source_id, "120000000000000001");
  assertEquals(r.media_url, "https://example.invalid/img.jpg");
});

Deno.test("parse: referral fb.me com ctwa_clid em messages[].referral.ctwa_clid", () => {
  assertEquals(parseCloudApiReferral(msgFbMe)!.ctwa_clid, "ARAkTESTCLID");
});

Deno.test("parse: sem referral / referral vazia → null", () => {
  assertEquals(parseCloudApiReferral({ type: "text" }), null);
  assertEquals(parseCloudApiReferral({ referral: {} }), null);
});

Deno.test("update: com clid grava o clid", () => {
  const u = buildReferralContactUpdate(parseCloudApiReferral(msgFbMe)!, "2026-11-07T00:00:00.000Z");
  assertEquals(u.ad_referral_ctwa_clid, "ARAkTESTCLID");
  assertEquals(u.source, "ctwa");
});

Deno.test("update: referral posterior SEM clid não apaga o clid já capturado", () => {
  const u = buildReferralContactUpdate(parseCloudApiReferral(msgWaMe)!, "2026-11-07T00:00:00.000Z");
  assertEquals("ad_referral_ctwa_clid" in u, false);
  assertEquals(u.ad_referral_source_url, "https://wa.me/550000000000");
});
