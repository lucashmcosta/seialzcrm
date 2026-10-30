import { assertEquals } from "jsr:@std/assert@1";
import { resolveSyncedTemplateType } from "./template_type.ts";

Deno.test("AUTHENTICATION grava authentication", () => {
  assertEquals(resolveSyncedTemplateType("AUTHENTICATION"), "authentication");
  assertEquals(resolveSyncedTemplateType("authentication"), "authentication");
});

Deno.test("outras categorias continuam text", () => {
  assertEquals(resolveSyncedTemplateType("MARKETING"), "text");
  assertEquals(resolveSyncedTemplateType("UTILITY"), "text");
  assertEquals(resolveSyncedTemplateType(undefined), "text");
  assertEquals(resolveSyncedTemplateType(null), "text");
});
