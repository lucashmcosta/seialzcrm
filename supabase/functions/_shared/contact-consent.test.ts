import { assertEquals } from "jsr:@std/assert@1";
import { checkProactiveContact, proactiveCheckFromRow } from "./contact-consent.ts";

Deno.test("não contatar: marcado ou inexistente bloqueia; erro de leitura não libera", () => {
  assertEquals(proactiveCheckFromRow({ do_not_contact: false }, false), "allowed");
  assertEquals(proactiveCheckFromRow({ do_not_contact: null }, false), "allowed");
  assertEquals(proactiveCheckFromRow({ do_not_contact: true }, false), "blocked");
  assertEquals(proactiveCheckFromRow({ do_not_contact: false, deleted_at: "2026-11-01T00:00:00Z" }, false), "blocked");
  assertEquals(proactiveCheckFromRow(null, false), "blocked");
  // sem conseguir ler o contato, não se envia
  assertEquals(proactiveCheckFromRow({ do_not_contact: false }, true), "unknown");
  assertEquals(proactiveCheckFromRow(null, true), "unknown");
});

Deno.test("consulta o contato dentro da organização", async () => {
  const filtros: string[] = [];
  const fake = (row: unknown, error: unknown = null) => ({
    from: (t: string) => {
      filtros.push(t);
      const b: Record<string, unknown> = {};
      b.select = () => b;
      b.eq = (col: string, v: string) => { filtros.push(`${col}=${v}`); return b; };
      b.maybeSingle = () => Promise.resolve({ data: row, error });
      return b;
    },
  });
  assertEquals(await checkProactiveContact(fake({ do_not_contact: true }), "org-1", "c-1"), "blocked");
  assertEquals(filtros, ["contacts", "id=c-1", "organization_id=org-1"]);
  assertEquals(await checkProactiveContact(fake({ do_not_contact: false }), "org-1", "c-1"), "allowed");
  assertEquals(await checkProactiveContact(fake(null, { message: "falha" }), "org-1", "c-1"), "unknown");
  assertEquals(await checkProactiveContact(fake({ do_not_contact: false }), "org-1", null), "blocked");
});
