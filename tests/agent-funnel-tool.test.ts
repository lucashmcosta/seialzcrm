import { assert, assertEquals } from "jsr:@std/assert@1";
import {
  applyFunnelAction, decideLoss, decideMove, type FunnelDeps, type FunnelSettings, parseFunnelSettings, runClassifyLead,
  silenceLossDetail, type StageInfo,
} from "../supabase/functions/_shared/intelligence/funnel-tool.ts";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOVA = id(1), CONF = id(2), EQUIPE = id(3), QUALI = id(4), CONTRATO = id(5), GANHO = id(6), PERDIDO = id(7);
const D_NUNCA = id(11), D_IDADE = id(12), D_SILENCIO = id(13);

const STAGES: StageInfo[] = [
  { id: NOVA, order_index: 1, type: "custom" },
  { id: CONF, order_index: 2, type: "custom" },
  { id: EQUIPE, order_index: 3, type: "custom" },
  { id: QUALI, order_index: 4, type: "custom" },
  { id: CONTRATO, order_index: 5, type: "custom" },
  { id: GANHO, order_index: 100, type: "won" },
  { id: PERDIDO, order_index: 101, type: "lost" },
];

const RAW = {
  mode: "apply",
  outcomes: [
    { key: "segue", label: "Qualificada", description: "o caso segue", stage_id: QUALI },
    { key: "equipe_analisa", label: "Equipe analisa", description: "precisa de análise", stage_id: EQUIPE },
    { key: "nao_se_encaixa", label: "Não se encaixa", description: "sem direito", loss_detail_ids: [D_NUNCA, D_IDADE] },
  ],
  reply_stage_id: CONF,
  handoff_stage_id: EQUIPE,
  silence_after_hours: 72,
  silence_rules: [{ stage_id: CONF, detail_id: D_SILENCIO }],
};

const open = (stage: string) => ({ id: "opp-1", status: "open", pipeline_stage_id: stage });

function fakeDeps(over: Partial<FunnelDeps> = {}) {
  const calls: string[] = [];
  const notes: Array<{ content: string; meta: Record<string, unknown> }> = [];
  const deps: FunnelDeps = {
    isTestMode: false,
    settings: parseFunnelSettings(RAW),
    stages: STAGES,
    lossDetails: [
      { id: D_NUNCA, name: "Nunca contribuiu antes do parto", requires_description: false },
      { id: D_IDADE, name: "Bebê com 5 anos ou mais", requires_description: false },
    ],
    openOpportunity: async () => open(NOVA),
    move: async (o, s) => { calls.push(`move:${o}:${s}`); return { ok: true }; },
    lose: async (o, d) => { calls.push(`lose:${o}:${d}`); return { ok: true }; },
    note: async (content, meta) => { notes.push({ content, meta }); },
    shadowNoted: async () => false,
    ...over,
  };
  return { deps, calls, notes };
}

Deno.test("configuração: guarda só o que é válido e começa em modo sombra", () => {
  const s = parseFunnelSettings({
    outcomes: [
      { key: "ok", label: "Ok", stage_id: QUALI },
      { key: "dup", label: "Etapa e perda juntas", stage_id: QUALI, loss_detail_ids: [D_NUNCA] },
      { key: "Bad Key!", label: "x", stage_id: QUALI },
      { key: "sem_nada", label: "Sem etapa nem perda" },
      { key: "ok", label: "Repetida", stage_id: CONF },
    ],
    silence_after_hours: 2,
    silence_rules: [{ stage_id: CONF, detail_id: "não-é-uuid" }],
  })!;
  assertEquals(s.mode, "shadow");
  assertEquals(s.outcomes.map((o) => o.key), ["ok"]);
  assertEquals(s.silence_after_hours, 72);
  assertEquals(s.silence_rules, []);
  assertEquals(parseFunnelSettings({}), null);
  assertEquals(parseFunnelSettings(null), null);
});

Deno.test("mover: só para a frente, nunca de ganho ou perdido", () => {
  assertEquals(decideMove(open(NOVA), STAGES, QUALI), { kind: "move", stageId: QUALI });
  assertEquals(decideMove(open(QUALI), STAGES, EQUIPE), { kind: "noop", why: "not_forward" });
  assertEquals(decideMove(open(QUALI), STAGES, QUALI), { kind: "noop", why: "not_forward" });
  assertEquals(decideMove({ ...open(GANHO), status: "won" }, STAGES, CONTRATO), { kind: "noop", why: "closed" });
  assertEquals(decideMove(open(NOVA), STAGES, GANHO), { kind: "noop", why: "unknown_stage" });
  assertEquals(decideMove(open(NOVA), STAGES, id(99)), { kind: "noop", why: "unknown_stage" });
  assertEquals(decideMove(null, STAGES, QUALI), { kind: "noop", why: "no_opportunity" });
});

Deno.test("perder: só aberta e só com detalhe permitido", () => {
  assertEquals(decideLoss(open(CONF), STAGES, D_NUNCA, [D_NUNCA]), { kind: "lose", detailId: D_NUNCA });
  assertEquals(decideLoss(open(CONF), STAGES, D_IDADE, [D_NUNCA]), { kind: "noop", why: "detail_not_allowed" });
  assertEquals(decideLoss({ ...open(PERDIDO), status: "lost" }, STAGES, D_NUNCA, [D_NUNCA]), { kind: "noop", why: "closed" });
});

Deno.test("silêncio: só depois de todos os follow-ups, do prazo e sem resposta", () => {
  const settings = parseFunnelSettings(RAW)!;
  const now = Date.parse("2026-11-24T12:00:00Z");
  const base = {
    settings, stageId: CONF, followupCount: 2, followupTotal: 2,
    lastFollowupAt: "2026-11-21T10:00:00Z", lastInboundAt: "2026-11-20T10:00:00Z", now,
  };
  assertEquals(silenceLossDetail(base), D_SILENCIO);
  assertEquals(silenceLossDetail({ ...base, followupCount: 1 }), null);
  assertEquals(silenceLossDetail({ ...base, lastFollowupAt: "2026-11-23T10:00:00Z" }), null);
  assertEquals(silenceLossDetail({ ...base, lastInboundAt: "2026-11-22T10:00:00Z" }), null);
  assertEquals(silenceLossDetail({ ...base, stageId: EQUIPE }), null);
  assertEquals(silenceLossDetail({ ...base, followupTotal: 0, followupCount: 0 }), null);
});

Deno.test("classify_lead: move para a etapa do resultado e deixa a nota", async () => {
  const { deps, calls, notes } = fakeDeps();
  const out = await runClassifyLead({ outcome: "segue", reason: "grávida, saiu do emprego em 2026" }, deps);
  assert(out.modelMessage.startsWith("Registrado"));
  assertEquals(calls, [`move:opp-1:${QUALI}`]);
  assertEquals(notes.length, 1);
  assertEquals(notes[0].meta.origin, "classify_lead");
});

Deno.test("classify_lead: perda pelo nome do detalhe", async () => {
  const { deps, calls } = fakeDeps();
  await runClassifyLead({ outcome: "nao_se_encaixa", loss_detail: "bebe com 5 anos ou mais", reason: "bebê de 2019" }, deps);
  assertEquals(calls, [`lose:opp-1:${D_IDADE}`]);
});

Deno.test("classify_lead: perda sem detalhe pede o detalhe e não grava", async () => {
  const { deps, calls, notes } = fakeDeps();
  const out = await runClassifyLead({ outcome: "nao_se_encaixa", reason: "x" }, deps);
  assert(out.modelMessage.includes("Falta o motivo"));
  assertEquals(calls.length + notes.length, 0);
});

Deno.test("classify_lead: resultado desconhecido não grava", async () => {
  const { deps, calls } = fakeDeps();
  const out = await runClassifyLead({ outcome: "ganhou", reason: "x" }, deps);
  assert(out.modelMessage.includes("Resultado inválido"));
  assertEquals(calls, []);
});

Deno.test("classify_lead: não volta etapa que a equipe já avançou", async () => {
  const { deps, calls, notes } = fakeDeps({ openOpportunity: async () => open(CONTRATO) });
  await runClassifyLead({ outcome: "equipe_analisa", reason: "x" }, deps);
  assertEquals(calls, []);
  assertEquals(notes, []);
});

Deno.test("classify_lead: simulador não toca no banco", async () => {
  let touched = false;
  const { deps } = fakeDeps({
    isTestMode: true,
    openOpportunity: async () => { touched = true; return null; },
  });
  const out = await runClassifyLead({ outcome: "segue", reason: "x" }, deps);
  assert(out.modelMessage.includes("Simulado"));
  assertEquals(touched, false);
});

Deno.test("modo sombra: só a nota, uma vez por resultado", async () => {
  const settings = { ...(parseFunnelSettings(RAW) as FunnelSettings), mode: "shadow" as const };
  const { deps, calls, notes } = fakeDeps({ settings });
  await runClassifyLead({ outcome: "segue", reason: "x" }, deps);
  assertEquals(calls, []);
  assertEquals(notes.length, 1);
  assert(notes[0].content.includes("nada foi mudado"));

  const again = fakeDeps({ settings, shadowNoted: async () => true });
  await runClassifyLead({ outcome: "segue", reason: "x" }, again.deps);
  assertEquals(again.notes, []);
});

Deno.test("falha ao mover não deixa nota de sucesso", async () => {
  const { deps, notes } = fakeDeps({ move: async () => ({ ok: false, error: "x" }) });
  const r = await applyFunnelAction(deps, "apply", open(NOVA), { kind: "move", stageId: QUALI }, { origin: "classify_lead", label: "Qualificada", reason: null });
  assertEquals(r.applied, false);
  assertEquals(notes, []);
});
