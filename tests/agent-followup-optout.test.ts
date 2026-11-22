import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  FOLLOWUP_OPTOUT_ID, FOLLOWUP_OPTOUT_TITLE, followUpOptOutInteractive, isFollowUpOptOut, shouldOfferFollowUpOptOut,
} from "../supabase/functions/_shared/intelligence/followup-optout.ts";
import { validateInteractive } from "../supabase/functions/_shared/whatsapp-interactive.ts";

Deno.test("desligado (null) nunca oferece o botão", () => {
  assertEquals(shouldOfferFollowUpOptOut(1, 2, null), false);
  assertEquals(shouldOfferFollowUpOptOut(2, 2, undefined), false);
});

Deno.test("na 1ª retomada: só a tentativa 1 leva o botão", () => {
  assert(shouldOfferFollowUpOptOut(1, 2, 1));
  assertEquals(shouldOfferFollowUpOptOut(2, 2, 1), false);
});

Deno.test("na 2ª retomada: só a tentativa 2 leva o botão", () => {
  assertEquals(shouldOfferFollowUpOptOut(1, 2, 2), false);
  assert(shouldOfferFollowUpOptOut(2, 2, 2));
});

Deno.test("pede a 2ª mas o agente só tem 1 retomada: vai na última", () => {
  assert(shouldOfferFollowUpOptOut(1, 1, 2));
});

Deno.test("a mensagem com o botão passa nas regras da Meta", () => {
  const p = followUpOptOutInteractive("Rafaela, ainda quer ver seu caso? Ficou faltando a data em que você saiu.");
  assertEquals(validateInteractive(p), []);
  assertEquals(p.kind === "buttons" ? p.buttons : [], [{ id: FOLLOWUP_OPTOUT_ID, title: FOLLOWUP_OPTOUT_TITLE }]);
});

Deno.test("toque no botão é reconhecido pelo id, qualquer que seja o texto", () => {
  assert(isFollowUpOptOut({ interactive_reply: { id: FOLLOWUP_OPTOUT_ID } }, "qualquer coisa"));
  assertEquals(isFollowUpOptOut({ interactive_reply: { id: "outro_botao" } }, "Sim, vamos continuar"), false);
});

Deno.test("texto digitado igual ao do botão também vale; frases parecidas não", () => {
  assert(isFollowUpOptOut(null, "Não tenho interesse"));
  assert(isFollowUpOptOut(null, "nao tenho mais interesse!"));
  assertEquals(isFollowUpOptOut(null, "não tenho interesse agora, mas depois sim"), false);
  assertEquals(isFollowUpOptOut(null, null), false);
});
