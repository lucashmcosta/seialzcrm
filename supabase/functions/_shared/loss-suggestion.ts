// Regras puras da sugestão de motivo de perda (testes em loss-suggestion.test.ts).
// A IA recebe o cadastro da org como lista de códigos e devolve um código; aqui o código vira motivo/detalhe
// e qualquer coisa fora do cadastro é descartada.

export interface LossOptionDetail { id: string; code: string; name: string; help_text?: string | null }
export interface LossOptionReason { id: string; code: string; name: string; details: LossOptionDetail[] }
export interface LossOptions { reasons: LossOptionReason[] }

export interface ConversationLine { at: string; who: "cliente" | "empresa" | "nota"; text: string }

export interface LossSuggestion {
  reasonId: string;
  detailId: string | null;
  confidence: number;
  evidence: string;
}

/** Abaixo disso a tela não pré-seleciona nada. */
export const MIN_CONFIDENCE = 0.5;
const MAX_LINE = 600;
const MAX_TRANSCRIPT = 14000;

export function catalogText(options: LossOptions): string {
  const lines: string[] = [];
  for (const r of options.reasons) {
    if (r.details.length === 0) {
      lines.push(`${r.code} — ${r.name}`);
      continue;
    }
    for (const d of r.details) {
      const help = d.help_text?.trim() ? ` (${d.help_text.trim()})` : "";
      lines.push(`${d.code} — ${r.name} › ${d.name}${help}`);
    }
  }
  return lines.join("\n");
}

/** Conversa em texto, mais recente no fim; corta pelo começo quando passa do limite. */
export function transcriptText(lines: ConversationLine[]): string {
  const label = { cliente: "Cliente", empresa: "Empresa", nota: "Nota interna da equipe" } as const;
  const out = lines
    .filter((l) => l.text.trim())
    .map((l) => `[${l.at.slice(0, 16).replace("T", " ")}] ${label[l.who]}: ${l.text.trim().replace(/\s+/g, " ").slice(0, MAX_LINE)}`);
  let total = 0;
  const kept: string[] = [];
  for (let i = out.length - 1; i >= 0; i--) {
    total += out[i].length + 1;
    if (total > MAX_TRANSCRIPT) break;
    kept.unshift(out[i]);
  }
  return kept.join("\n");
}

export function buildMessages(options: LossOptions, stageName: string | null, transcript: string) {
  const system = [
    "Você analisa por que uma oportunidade de venda foi perdida.",
    "Escolha UM código da lista de motivos da empresa, com base só no que está na conversa.",
    "Se a conversa não deixa claro o motivo, responda com code null. Não invente.",
    "Responda só com JSON: {\"code\": \"A1\" ou null, \"confidence\": número de 0 a 1, \"evidence\": \"frase curta em português dizendo o que na conversa mostra o motivo\"}.",
  ].join("\n");
  const user = [
    "Motivos cadastrados (código — motivo › detalhe):",
    catalogText(options),
    "",
    `Etapa em que a oportunidade estava: ${stageName ?? "desconhecida"}`,
    "",
    "Conversa:",
    transcript,
  ].join("\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** Lê o JSON da IA e resolve o código no cadastro. null = sem sugestão. */
export function parseSuggestion(raw: string, options: LossOptions): LossSuggestion | null {
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) return null;
  let data: any;
  try { data = JSON.parse(match[0]); } catch { return null; }
  const code = data?.code;
  const confidence = Math.max(0, Math.min(1, Number(data.confidence) || 0));
  const evidence = typeof data.evidence === "string" ? data.evidence.trim().slice(0, 500) : "";
  const found = resolveLossCode(code, options);
  return found ? { ...found, confidence, evidence } : null;
}

/** Código de detalhe (A1) ou de motivo (A) → ids do cadastro. null = fora do cadastro. */
export function resolveLossCode(code: unknown, options: LossOptions): { reasonId: string; detailId: string | null } | null {
  const c = typeof code === "string" ? code.trim().toUpperCase() : "";
  if (!c) return null;
  for (const r of options.reasons) {
    const d = r.details.find((x) => x.code.toUpperCase() === c);
    if (d) return { reasonId: r.id, detailId: d.id };
  }
  const reason = options.reasons.find((r) => r.code.toUpperCase() === c);
  return reason ? { reasonId: reason.id, detailId: null } : null;
}

/** Códigos que podem ser escolhidos: o detalhe quando o motivo tem, senão o próprio motivo. */
export function lossCodes(options: LossOptions): string[] {
  return options.reasons.flatMap((r) => r.details.length ? r.details.map((d) => d.code) : [r.code]);
}
