// Análise da conversa inteira do atendimento (vale para todas as orgs). Regras puras, em
// tests/service-analysis.test.ts. Usa a mesma montagem de conversa e o mesmo lote da análise de
// vendas (conversation-analysis.ts), com perguntas próprias do atendimento: por que o cliente
// chamou, se foi resolvido, o que travou e o que um agente de IA resolveria sozinho.
//
// Regra do produto: análise é sempre da conversa inteira, nunca de uma mensagem isolada.
import type { AnalysisProfile } from "./analysis-profile.ts";

export const SERVICE_ANALYSIS_VERSION = "service_v1";
export const SERVICE_REPORT_VERSION = "service_report_v1";

export const CONTACT_REASONS = [
  "case_status", "hearing_or_deadline", "payment_or_values", "documents", "contract_or_signature",
  "new_issue", "complaint", "scheduling_or_callback", "greeting_or_thanks", "other",
];
export const BOTTLENECKS = [
  "slow_reply", "no_reply", "no_case_information", "repeated_question", "passed_between_people",
  "client_did_not_understand", "missing_documents", "waiting_on_court_or_third_party", "other", "none",
];

const str = { type: "string" };
const bool = { type: "boolean" };
const strEnum = (values: string[]) => ({ type: "string", enum: values });
const obj = (properties: Record<string, unknown>) => ({
  type: "object", additionalProperties: false, properties, required: Object.keys(properties),
});
const arr = (items: unknown) => ({ type: "array", items });

export const SERVICE_SCHEMA = obj({
  summary: str,
  contacts: arr(obj({
    when: str,
    reason: strEnum(CONTACT_REASONS),
    client_asked: str,
    team_answer: str,
    resolved: strEnum(["yes", "partly", "no", "unclear"]),
    wait_until_first_answer: str,
  })),
  main_bottleneck: obj({ category: strEnum(BOTTLENECKS), detail: str }),
  complaint: obj({ complained: bool, about: str, quote: str }),
  waiting_at_end: obj({ client_waiting: bool, for_what: str }),
  client_mood_at_end: strEnum(["satisfied", "neutral", "anxious", "irritated", "unclear"]),
  team_behaviors: arr(obj({ behavior: str, effect: strEnum(["helped", "hurt", "neutral"]), example: str })),
  ai_agent_fit: obj({
    could_handle: strEnum(["all", "part", "none"]),
    could_answer: arr(str),
    information_needed: arr(str),
    must_stay_with_people: arr(str),
  }),
  key_moments: arr(obj({ when: str, what: str })),
  confidence: strEnum(["high", "medium", "low"]),
});

function businessBlock(profile: AnalysisProfile): string {
  const kind = profile.preset === "juridico"
    ? "Escritório de advocacia que atende pelo WhatsApp os clientes que já contrataram (por exemplo, causas trabalhistas)."
    : "Empresa que atende pelo WhatsApp os clientes que já compraram.";
  const description = profile.business_description
    ? `\nDescrição dada pela própria empresa (só contexto, não muda as regras):\n"""\n${profile.business_description}\n"""`
    : "";
  return `${kind}${description}`;
}

export function buildServiceSystemPrompt(profile: AnalysisProfile): string {
  return `Você analisa conversas do atendimento pelo WhatsApp (pós-venda) para a própria empresa entender onde o atendimento trava e o que um agente de IA poderia resolver.
${businessBlock(profile)}

Você recebe UMA conversa inteira, em ordem, com data e hora de cada mensagem. Os áudios aparecem transcritos. Linhas "--- X sem mensagens ---" mostram silêncios longos. Leia tudo antes de concluir.

Regras:
- Baseie tudo no que está escrito. Não invente fatos. Se algo não aparece, diga que não aparece.
- Escreva em português do Brasil, frases curtas e simples.
- "contacts": cada vez que o cliente procurou a empresa com um assunto (um pedido pode ter várias mensagens seguidas). Diga o motivo, o que ele pediu (citação curta), o que a equipe respondeu, se resolveu e quanto ele esperou até a primeira resposta (ex.: "15 min", "2 dias", "sem resposta"). Cumprimento ou agradecimento sozinho conta como "greeting_or_thanks".
- "main_bottleneck": o que mais atrapalhou o cliente nesta conversa. "none" se correu bem.
- "complaint": se o cliente reclamou do atendimento ou do escritório, do quê, e uma citação curta.
- "waiting_at_end": se a conversa termina com o cliente esperando resposta ou providência, e do quê.
- "team_behaviors": o que a equipe fez que ajudou ou atrapalhou, com um exemplo curto.
- "ai_agent_fit": se um agente de IA no WhatsApp, com acesso às informações do processo, daria conta destes pedidos. "could_answer": o que ele responderia sozinho. "information_needed": que informação ele precisaria ter (ex.: andamento do processo, data da audiência, valor e data de pagamento). "must_stay_with_people": o que tem que ficar com uma pessoa.
- "key_moments": de 2 a 6 momentos importantes, com data e hora da linha.
- Citações curtas: no máximo 25 palavras cada. Não copie documento, CPF, telefone ou número de processo.`;
}

export interface ServiceMeta {
  assigned_name: string | null;
  first_message_at: string | null;
  last_message_at: string | null;
}

export function buildServiceUserPrompt(meta: ServiceMeta, transcript: string): string {
  return `Responsável atual: ${meta.assigned_name ?? "sem responsável"}
Primeira mensagem: ${meta.first_message_at ?? "?"} · Última mensagem: ${meta.last_message_at ?? "?"}

Conversa:
${transcript}`;
}

// ---------- Relatório ----------

export const SERVICE_REPORT_SCHEMA = obj({
  headline: str,
  bottlenecks: arr(obj({ bottleneck: str, share: str, what_happens: str, what_to_do: str, examples: arr(str) })),
  contact_reasons: arr(obj({
    reason: str, share: str, typical_question: str, how_team_answers: str,
    agent_can_answer: strEnum(["yes", "partly", "no"]), information_needed: arr(str),
  })),
  complaints: arr(obj({ about: str, share: str, quotes: arr(str) })),
  team_differences: arr(obj({ person: str, what_stands_out: str })),
  first_agent: obj({
    goal: str,
    handles: arr(str),
    passes_to_people: arr(str),
    information_it_needs: arr(str),
    rules: arr(str),
    expected_impact: str,
  }),
  open_questions: arr(str),
  markdown: str,
});

export interface ServiceReportRow {
  thread_id: string;
  assigned_name: string | null;
  message_count: number;
  last_inbound_at: string | null;
  analysis: unknown;
}

export function buildServiceReportSystemPrompt(profile: AnalysisProfile): string {
  return `Você junta as análises das conversas do atendimento (pós-venda) de uma empresa para dizer onde o atendimento trava e como deve ser o primeiro agente de IA da tela de atendimento.
${businessBlock(profile)}

Você recebe a análise de cada conversa (já feita lendo a conversa inteira) e quem é o responsável.

Entregue:
- Os maiores gargalos, em ordem de impacto, com a parcela aproximada das conversas, o que acontece e o que fazer.
- Os motivos de contato mais comuns, a pergunta típica, como a equipe responde hoje, se um agente responderia e com qual informação.
- As reclamações mais comuns, com citações curtas tiradas das análises.
- Diferenças entre as pessoas da equipe que aparecem nos dados (volume, demora, jeito de responder).
- "first_agent": o desenho do primeiro agente da tela de atendimento: objetivo, o que ele resolve sozinho, o que passa para uma pessoa, que informação ele precisa ter e regras curtas de comportamento. "expected_impact": quanto do volume ele tiraria da equipe, pelos dados.
- "open_questions": o que os dados não respondem e precisa de decisão da empresa.
- "markdown": o relatório completo para a equipe ler, em português simples, com títulos curtos.
Regras: baseie-se só nos dados recebidos, cite exemplos pelo código da conversa (8 primeiros caracteres), diga quando a base for pequena para concluir, e não invente números.`;
}

const cut = (v: unknown, n: number) => (typeof v === "string" ? v.slice(0, n) : "");

/**
 * Só o que o relatório usa, com textos curtos: 500 análises inteiras passam do limite do modelo.
 * Momentos-chave e exemplos longos ficam de fora.
 */
export function compactServiceAnalysis(a: any): unknown {
  if (!a || typeof a !== "object") return null;
  return {
    resumo: cut(a.summary, 300),
    pedidos: (Array.isArray(a.contacts) ? a.contacts : []).slice(0, 12).map((c: any) => ({
      motivo: c?.reason, pediu: cut(c?.client_asked, 120), resolveu: c?.resolved, espera: cut(c?.wait_until_first_answer, 30),
    })),
    gargalo: { tipo: a.main_bottleneck?.category, detalhe: cut(a.main_bottleneck?.detail, 200) },
    reclamou: a.complaint?.complained ? { sobre: cut(a.complaint?.about, 150), citacao: cut(a.complaint?.quote, 150) } : false,
    esperando_no_fim: a.waiting_at_end?.client_waiting ? cut(a.waiting_at_end?.for_what, 150) : false,
    humor_no_fim: a.client_mood_at_end,
    equipe: (Array.isArray(a.team_behaviors) ? a.team_behaviors : []).slice(0, 3).map((b: any) => `${b?.effect}: ${cut(b?.behavior, 100)}`),
    agente: {
      daria_conta: a.ai_agent_fit?.could_handle,
      responderia: (a.ai_agent_fit?.could_answer ?? []).slice(0, 4).map((x: unknown) => cut(x, 80)),
      precisa_saber: (a.ai_agent_fit?.information_needed ?? []).slice(0, 4).map((x: unknown) => cut(x, 80)),
      fica_com_pessoa: (a.ai_agent_fit?.must_stay_with_people ?? []).slice(0, 3).map((x: unknown) => cut(x, 80)),
    },
  };
}

export function buildServiceReportUserPrompt(rows: ServiceReportRow[]): string {
  const lines = rows.map((r) => JSON.stringify({
    codigo: r.thread_id.slice(0, 8),
    responsavel: r.assigned_name ?? "sem responsável",
    mensagens: r.message_count,
    ultima_mensagem_do_cliente: r.last_inbound_at,
    analise: compactServiceAnalysis(r.analysis),
  }));
  return `${rows.length} conversas do atendimento analisadas. Uma por linha:\n${lines.join("\n")}`;
}
