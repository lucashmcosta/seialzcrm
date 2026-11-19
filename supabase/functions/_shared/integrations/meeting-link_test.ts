import { assertEquals } from "jsr:@std/assert@1";
import { meetingLinkText, splitMeetingLink } from "./meeting-link.ts";

Deno.test("espaço depois do ? é tirado", () => {
  assertEquals(splitMeetingLink("https://trt15-jus-br.zoom.us/j/123? pwd=abc").url, "https://trt15-jus-br.zoom.us/j/123?pwd=abc");
});

Deno.test("espaço no fim ou no meio do endereço", () => {
  assertEquals(splitMeetingLink("https://trt2-jus-br.zoom.us/j/123?pwd=abc  ").url, "https://trt2-jus-br.zoom.us/j/123?pwd=abc");
  assertEquals(splitMeetingLink("https://trt2-jus-br. zoom.us/j/123?pwd=abc").url, "https://trt2-jus-br.zoom.us/j/123?pwd=abc");
  assertEquals(splitMeetingLink("https://trt2-jus-br.zoom.us/j /123?pwd=abc").url, "https://trt2-jus-br.zoom.us/j/123?pwd=abc");
  assertEquals(splitMeetingLink("https://trt2-jus-br.zoom.us /j/123").url, "https://trt2-jus-br.zoom.us/j/123");
});

Deno.test("ID e senha colados depois do link ficam à parte", () => {
  const r = splitMeetingLink("https://trt2-jus-br.zoom.us/j/123?pwd=abc.1 ID da reunião: 835 111 222 Senha: 4vt");
  assertEquals(r.url, "https://trt2-jus-br.zoom.us/j/123?pwd=abc.1");
  assertEquals(r.extra, "ID da reunião: 835 111 222 Senha: 4vt");
  assertEquals(meetingLinkText("https://x.zoom.us/j/1 ID: 9"), "https://x.zoom.us/j/1 (ID: 9)");
});

Deno.test("ponto final da frase não entra na senha seguinte", () => {
  const r = splitMeetingLink("https://x.zoom.us/j/1?pwd=abc. Senha:xyz.");
  assertEquals(r.url, "https://x.zoom.us/j/1?pwd=abc");
  assertEquals(r.extra, "Senha:xyz.");
});

Deno.test("dois links: fica o primeiro, o resto vai junto", () => {
  const r = splitMeetingLink("https://trt1-jus-br.zoom.us/my/sala.rj ou https://trt1-jus-br.zoom.us/j/9?pwd=z");
  assertEquals(r.url, "https://trt1-jus-br.zoom.us/my/sala.rj");
  assertEquals(r.extra, "ou https://trt1-jus-br.zoom.us/j/9?pwd=z");
});

Deno.test("sem link válido", () => {
  assertEquals(splitMeetingLink(null), { url: null, extra: null });
  assertEquals(splitMeetingLink("sala 3 do fórum"), { url: null, extra: "sala 3 do fórum" });
  assertEquals(meetingLinkText("javascript:alert(1)"), null);
  assertEquals(splitMeetingLink("https://x.zoom.us/j/1").url, "https://x.zoom.us/j/1");
});
