import { assert, assertEquals, assertStrictEquals } from "jsr:@std/assert@1";
import { ANALYSIS_SYSTEM_PROMPT, ANALYSIS_TOOL } from "../supabase/functions/_shared/intelligence/analyze-prompt.ts";
import { buildAnalysisPrompt, buildAnalysisTool, normalizeProfile, objectionKey, profileKey } from "../supabase/functions/_shared/intelligence/analysis-profile.ts";

Deno.test("modelo jurídico é idêntico ao prompt e à ferramenta de hoje", () => {
  const p = normalizeProfile({ preset: "juridico", business_description: "ignorado", objections: [{ label: "Outra" }] });
  assertStrictEquals(buildAnalysisPrompt(p), ANALYSIS_SYSTEM_PROMPT);
  assertStrictEquals(buildAnalysisTool(p), ANALYSIS_TOOL);
});

Deno.test("sem perfil vale o geral, sem nenhum termo jurídico", () => {
  const p = normalizeProfile(null);
  assertEquals(p.preset, "geral");
  const prompt = buildAnalysisPrompt(p);
  for (const termo of [/jur[ií]dic/i, /trabalhista/i, /FGTS/, /INSS/, /indeniza/i, /empregador/i, /honor[aá]rio/i, /advogado/i, /CTPS/, /prescri/i, /da causa/i]) {
    assert(!termo.test(prompt), `sobrou ${termo}`);
  }
});

Deno.test("descrição e objeções próprias entram no prompt e na ferramenta", () => {
  const p = normalizeProfile({ business_description: " Plano de saúde pet ", objections: [{ label: "Carência do plano" }] });
  const prompt = buildAnalysisPrompt(p);
  assert(prompt.includes("Plano de saúde pet"));
  assert(prompt.includes("carencia_do_plano -> Carência do plano"));
  const objection = buildAnalysisTool(p).function.parameters.properties.objection_type as { enum: unknown[] };
  assert(objection.enum.includes("carencia_do_plano"));
  assert(objection.enum.includes(null));
  assert(!objection.enum.includes("medo_de_processar_empregador"));
  assertEquals(objection.enum.at(-1), "other");
});

Deno.test("normalização limpa, corta, remove repetidas e as que já existem", () => {
  const p = normalizeProfile({
    objections: [{ label: "  Medo  de golpe " }, { label: "medo de golpe" }, { label: "Price" }, { label: "" }, {},
      ...Array.from({ length: 20 }, (_, i) => ({ label: `Item ${i}` }))],
    business_description: "x".repeat(2000),
  });
  assertEquals(p.objections[0], { key: "medo_de_golpe", label: "Medo de golpe" });
  assertEquals(p.objections.length, 12);
  assertEquals(p.business_description.length, 1000);
  assertEquals(objectionKey("Já tem veterinário!"), "ja_tem_veterinario");
});

Deno.test("chave muda quando o critério muda", () => {
  const a = profileKey(normalizeProfile({ business_description: "A" }));
  assertEquals(a, profileKey(normalizeProfile({ business_description: "A" })));
  assert(a !== profileKey(normalizeProfile({ business_description: "B" })));
  assert(a !== profileKey(normalizeProfile({ preset: "juridico", business_description: "A" })));
});
