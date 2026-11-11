import { assertEquals } from "jsr:@std/assert@1";
import { classifySpecialInbound, UNREADABLE_NOTICE } from "./special-inbound.ts";

const unsupported = (sub: string) => ({
  type: "unsupported",
  errors: [{ code: 131051 }],
  unsupported: { type: sub, raw_type: sub },
});

Deno.test("álbum e reação removida não viram mensagem", () => {
  assertEquals(classifySpecialInbound(unsupported("album")), { action: "skip", reason: "album" });
  assertEquals(classifySpecialInbound({ type: "reaction", reaction: { message_id: "x" } }),
    { action: "skip", reason: "reaction_removed" });
});

Deno.test("reação com emoji segue o caminho normal", () => {
  assertEquals(classifySpecialInbound({ type: "reaction", reaction: { emoji: "👍", message_id: "x" } }), null);
});

Deno.test("apagada e editada viram aviso sem IA", () => {
  const apagada = classifySpecialInbound(unsupported("revoke"));
  assertEquals(apagada?.action === "notice" && apagada.triggerAi, false);
  const editada = classifySpecialInbound(unsupported("edit"));
  assertEquals(editada?.action === "notice" && editada.content.includes("editou"), true);
});

Deno.test("desconhecida vira aviso legível e a IA pode pedir para reenviar", () => {
  assertEquals(classifySpecialInbound(unsupported("unknown")),
    { action: "notice", content: UNREADABLE_NOTICE, triggerAi: true });
});

Deno.test("troca de número vira aviso sem IA", () => {
  assertEquals(classifySpecialInbound({
    type: "system",
    system: { type: "user_changed_number", wa_id: "5511900000000", body: "User A changed..." },
  }), { action: "notice", content: "🔁 O cliente trocou de número para +5511900000000.", triggerAi: false });
});

Deno.test("texto, mídia e botões não são afetados", () => {
  assertEquals(classifySpecialInbound({ type: "text", text: { body: "oi" } }), null);
  assertEquals(classifySpecialInbound({ type: "image", image: { id: "1" } }), null);
  assertEquals(classifySpecialInbound({ type: "interactive", interactive: { type: "button_reply" } }), null);
});
