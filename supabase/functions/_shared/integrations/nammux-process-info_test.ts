import { assertEquals } from "jsr:@std/assert@1";
import { parseProcessInfo } from "./nammux-process-info.ts";

Deno.test("resposta do Nammux: agenda em ordem, linha do tempo mais recente primeiro", () => {
  const r = parseProcessInfo({
    processes: [{
      seialz_opportunity_id: "opp-1",
      agenda: [
        { type: "pericia", start_at: "2026-12-20T13:00:00Z", all_day: false, timezone: "America/Sao_Paulo", location: "Rua Exemplo, 1" },
        { type: "audiencia", subtype: "Una", start_at: "2026-12-10T13:00:00Z", modality: "virtual", virtual_link: "https://exemplo.invalid/sala" },
      ],
      timeline: [
        { at: "2026-11-01T10:00:00Z", title: "Seu processo foi registrado na Justiça", description: "Ele foi sorteado para uma Vara.", attention: false },
        { at: "2026-11-18T10:00:00Z", title: "Sentença: os pedidos foram negados", description: "x", attention: true },
      ],
    }],
  })!;
  assertEquals(r.agenda.map((a) => a.event_type), ["audiencia", "pericia"]);
  assertEquals(r.agenda[0].opportunity_id, "opp-1");
  assertEquals(r.timeline.map((t) => t.attention), [true, false]);
});

Deno.test("item fora do contrato é ignorado; resposta sem lista é recusada", () => {
  const r = parseProcessInfo({
    processes: [
      { seialz_opportunity_id: "opp-1", agenda: [{ type: "", start_at: "2026-12-10T13:00:00Z" }, { type: "audiencia", start_at: "amanhã" }], timeline: [{ at: "x", title: "y" }, { at: "2026-11-01T10:00:00Z" }] },
      { agenda: [{ type: "audiencia", start_at: "2026-12-10T13:00:00Z" }] },
    ],
  })!;
  assertEquals(r, { agenda: [], timeline: [] });
  assertEquals(parseProcessInfo(null), null);
  assertEquals(parseProcessInfo({ processes: "x" }), null);
});

Deno.test("contrato: a resposta de exemplo do Nammux é lida inteira", async () => {
  const fixture = JSON.parse(await Deno.readTextFile(new URL("./fixtures-nammux-process-info.response.json", import.meta.url)));
  const r = parseProcessInfo(fixture)!;
  const total = (k: "agenda" | "timeline") =>
    (fixture.processes as Array<Record<string, unknown[]>>).reduce((n, p) => n + (p[k]?.length ?? 0), 0);
  assertEquals(r.agenda.length, Math.min(total("agenda"), 10));
  assertEquals(r.timeline.length, Math.min(total("timeline"), 10));
  for (const t of r.timeline) assertEquals(typeof t.title, "string");
});
