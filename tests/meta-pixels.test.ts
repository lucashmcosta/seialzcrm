import { assertEquals } from "jsr:@std/assert@1";
import { mergePixels, pixelHasFired, singleOrNull } from "../supabase/functions/_shared/meta/pixels.ts";

Deno.test("Pixel com data zero da Meta conta como nunca disparado", () => {
  assertEquals(pixelHasFired("1969-12-31T16:00:00-0800"), false);
  assertEquals(pixelHasFired(undefined), false);
  assertEquals(pixelHasFired("lixo"), false);
  assertEquals(pixelHasFired("2026-11-01T10:00:00-0800"), true);
});

Deno.test("Mesmo Pixel em duas contas aparece uma vez e herda o disparo", () => {
  const out = mergePixels([
    { ad_account_name: "A", rows: [{ id: "1", name: "Um", last_fired_time: "1969-12-31T16:00:00-0800" }] },
    { ad_account_name: "B", rows: [{ id: "1", name: "Um", last_fired_time: "2026-11-01T10:00:00-0800" }] },
  ]);
  assertEquals(out.length, 1);
  assertEquals(out[0].ad_account_name, "A");
  assertEquals(out[0].has_fired, true);
});

Deno.test("Pixels que já recebem eventos vêm primeiro; linha sem id é ignorada", () => {
  const out = mergePixels([{
    ad_account_name: null,
    rows: [
      { id: "1", name: "Antes no alfabeto" },
      { id: "2", name: "Zeta", last_fired_time: "2026-11-01T10:00:00-0800" },
      { name: "sem id" },
    ],
  }]);
  assertEquals(out.map((p) => p.id), ["2", "1"]);
});

Deno.test("Página só é preenchida sozinha quando não há dúvida", () => {
  assertEquals(singleOrNull(["1", "1", null]), "1");
  assertEquals(singleOrNull(["1", "2"]), null);
  assertEquals(singleOrNull([]), null);
});
