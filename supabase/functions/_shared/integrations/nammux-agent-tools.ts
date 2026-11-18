// Ferramentas que a integração com o Nammux dá ao agente de ATENDIMENTO:
// consultar os horários livres da entrevista e pedir o agendamento.
//
// Seguem o mesmo contrato das ferramentas de widget (WidgetAgentTool), então o
// ai-agent-respond as executa sem conhecer o Nammux. Só entram para
// agent_type = 'support' e com a flag da organização ligada: o agente
// comercial não as recebe.
import type { WidgetAgentTool } from "../widgets/agent-tools.ts";
import { agendaWhen } from "./nammux-process-context.ts";
import { nammuxSignedPost } from "./nammux-client.ts";

export const NAMMUX_INTERVIEW_FLAG = "nammux_interview_scheduling";
export const NAMMUX_TOOL_KEY = "nammux_integration";
export const INTERVIEW_SLOTS_TOOL = "nammux_interview_slots";
export const INTERVIEW_SCHEDULE_TOOL = "nammux_schedule_interview";
/** Quantos horários o modelo vê de cada vez. */
export const SLOTS_SHOWN = 8;

export interface NammuxProcessRef {
  opportunity_id: string;
}

export interface NammuxSlots {
  enabled: boolean;
  timezone: string;
  current: string | null;
  slots: Array<{ start_at: string; end_at: string | null }>;
}

export interface NammuxToolDeps {
  isTestMode: boolean;
  /** Processos do contato, na mesma ordem do bloco PROCESSOS DO CLIENTE. */
  listProcesses(): Promise<NammuxProcessRef[]>;
  /** null = não foi possível consultar o Nammux. */
  fetchSlots(opportunityId: string): Promise<NammuxSlots | null>;
  /** Grava o pedido e enfileira o evento. Devolve o status de nammux_request_interview. */
  requestInterview(opportunityId: string, startAt: string, endAt: string | null): Promise<string | null>;
}

const TEAM = "Passe para a equipe com transfer_to_human, se disponível.";

/** Qual processo o modelo quis dizer. Com mais de um e sem número, pergunta. */
export function pickProcess(processes: NammuxProcessRef[], processNumber: unknown): { ref: NammuxProcessRef } | { message: string } {
  if (!processes.length) return { message: `Este cliente não tem processo no sistema do escritório. ${TEAM}` };
  if (processNumber === undefined || processNumber === null) {
    if (processes.length === 1) return { ref: processes[0] };
    return { message: `O cliente tem ${processes.length} processos. Pergunte de qual é a entrevista e chame de novo com process_number (1 a ${processes.length}, na ordem do bloco PROCESSOS DO CLIENTE).` };
  }
  const n = Number(processNumber);
  if (!Number.isInteger(n) || n < 1 || n > processes.length) {
    return { message: `process_number inválido. Use um número de 1 a ${processes.length}.` };
  }
  return { ref: processes[n - 1] };
}

/** Resposta do Nammux em formato conhecido, ou null se vier fora do contrato. */
export function parseSlots(data: Record<string, unknown> | null): NammuxSlots | null {
  if (!data || !Array.isArray(data.slots)) return null;
  const slots: NammuxSlots["slots"] = [];
  for (const raw of data.slots as unknown[]) {
    const s = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    if (typeof s.start_at !== "string" || isNaN(new Date(s.start_at).getTime())) continue;
    slots.push({
      start_at: new Date(s.start_at).toISOString(),
      end_at: typeof s.end_at === "string" && !isNaN(new Date(s.end_at).getTime()) ? new Date(s.end_at).toISOString() : null,
    });
  }
  const current = (data.current && typeof data.current === "object" ? data.current : {}) as Record<string, unknown>;
  return {
    enabled: data.enabled === true,
    timezone: typeof data.timezone === "string" && data.timezone ? data.timezone : "America/Sao_Paulo",
    current: typeof current.start_at === "string" && !isNaN(new Date(current.start_at).getTime())
      ? new Date(current.start_at).toISOString()
      : null,
    slots,
  };
}

export function slotsMessage(result: NammuxSlots | null): string {
  if (!result) return `Não consegui consultar a agenda agora. Não ofereça horário. ${TEAM}`;
  if (!result.enabled) return `A marcação automática de entrevista não está aberta. Não ofereça horário. ${TEAM}`;
  const atual = result.current ? agendaWhen(result.current, false, result.timezone) : null;
  const aviso = atual ? `O cliente já tem entrevista marcada para ${atual}. Escolher outro horário REMARCA essa entrevista.\n` : "";
  if (!result.slots.length) return `${aviso}Não há horário livre nos próximos dias. Não invente horário. ${TEAM}`;
  const lines = result.slots.slice(0, SLOTS_SHOWN).map((s, i) =>
    `${i + 1}. ${agendaWhen(s.start_at, false, result.timezone)} — start_at: ${s.start_at}`
  );
  return `${aviso}Horários livres para a entrevista:
${lines.join("\n")}
Ofereça até 3 destes ao cliente (com send_choices, se disponível), escrevendo o dia e a hora como aparecem acima. Quando ele escolher, chame ${INTERVIEW_SCHEDULE_TOOL} com o start_at EXATO da linha escolhida. Não ofereça horário que não esteja nesta lista.`;
}

export function scheduleMessage(status: string | null, when: string | null): string {
  switch (status) {
    case "requested":
      return `Pedido de entrevista enviado para ${when}. Diga ao cliente que você pediu esse horário e que a confirmação chega por aqui em alguns minutos. Não diga que já está confirmado.`;
    case "already_requested":
      return `Esse horário (${when}) já foi pedido para este cliente e a confirmação está a caminho. Não peça de novo.`;
    case "no_process":
      return `Este cliente não tem processo no sistema do escritório para marcar entrevista. ${TEAM}`;
    default:
      return `Não consegui registrar o pedido agora. Não diga que foi marcado. ${TEAM}`;
  }
}

export const NAMMUX_INTERVIEW_PROMPT = `
## AGENDAMENTO DE ENTREVISTA
Quando o cliente quiser marcar ou remarcar a entrevista com o escritório, chame ${INTERVIEW_SLOTS_TOOL} para ver os horários livres e ofereça alguns. Depois que ele escolher, chame ${INTERVIEW_SCHEDULE_TOOL}. Nunca invente horário e nunca diga que a entrevista está marcada ou confirmada: você só PEDE o horário, e a confirmação chega depois, em outra mensagem.
`;

export function buildNammuxInterviewTools(deps: NammuxToolDeps): WidgetAgentTool[] {
  const processNumber = {
    type: "integer",
    description: "Número do processo no bloco PROCESSOS DO CLIENTE. Só é necessário quando o cliente tem mais de um.",
  };
  return [
    {
      widgetKey: NAMMUX_TOOL_KEY,
      name: INTERVIEW_SLOTS_TOOL,
      description: "Consulta, na agenda do escritório, os horários livres para a entrevista do cliente. Use antes de oferecer qualquer horário.",
      parameters: { type: "object", properties: { process_number: processNumber }, required: [] },
      prompt: NAMMUX_INTERVIEW_PROMPT,
      async run(args) {
        const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
        const picked = pickProcess(await deps.listProcesses(), a.process_number);
        if ("message" in picked) return { modelMessage: picked.message };
        return { modelMessage: slotsMessage(await deps.fetchSlots(picked.ref.opportunity_id)) };
      },
    },
    {
      widgetKey: NAMMUX_TOOL_KEY,
      name: INTERVIEW_SCHEDULE_TOOL,
      description: `Pede ao escritório a entrevista no horário que o cliente escolheu. Use só com um start_at devolvido por ${INTERVIEW_SLOTS_TOOL}.`,
      parameters: {
        type: "object",
        properties: {
          start_at: { type: "string", description: `O start_at exato do horário escolhido, como veio de ${INTERVIEW_SLOTS_TOOL}.` },
          process_number: processNumber,
        },
        required: ["start_at"],
      },
      // A instrução já entra uma vez, pela primeira ferramenta.
      prompt: "",
      async run(args) {
        const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
        const picked = pickProcess(await deps.listProcesses(), a.process_number);
        if ("message" in picked) return { modelMessage: picked.message };

        const asked = typeof a.start_at === "string" ? new Date(a.start_at) : null;
        if (!asked || isNaN(asked.getTime())) {
          return { modelMessage: `start_at inválido. Chame ${INTERVIEW_SLOTS_TOOL} e use o start_at exato de uma das linhas.` };
        }
        // Confere na agenda de novo: o modelo pode ter errado o horário, ou ele pode ter sido tomado.
        const fresh = await deps.fetchSlots(picked.ref.opportunity_id);
        if (!fresh || !fresh.enabled) return { modelMessage: slotsMessage(fresh) };
        const slot = fresh.slots.find((s) => s.start_at === asked.toISOString());
        if (!slot) {
          return { modelMessage: `Esse horário não está mais livre. Avise o cliente e ofereça outros:\n${slotsMessage(fresh)}` };
        }
        const when = agendaWhen(slot.start_at, false, fresh.timezone);
        if (deps.isTestMode) {
          return { modelMessage: `(modo de teste: nada foi enviado ao escritório) ${scheduleMessage("requested", when)}` };
        }
        return { modelMessage: scheduleMessage(await deps.requestInterview(picked.ref.opportunity_id, slot.start_at, slot.end_at), when) };
      },
    },
  ];
}

/**
 * As ferramentas do Nammux para este agente. Qualquer tipo que não seja
 * 'support' recebe lista vazia sem consultar flag nem banco.
 */
export async function nammuxToolsForAgent(
  agentType: unknown,
  isEnabled: (flag: string) => Promise<boolean>,
  build: () => WidgetAgentTool[],
): Promise<WidgetAgentTool[]> {
  if (agentType !== "support") return [];
  if (!(await isEnabled(NAMMUX_INTERVIEW_FLAG))) return [];
  return build();
}

/** Dependências reais (banco e Nammux) para uma conversa. */
export function nammuxToolDeps(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ctx: { organizationId: string; contactId: string; threadId: string | null; isTestMode: boolean },
): NammuxToolDeps {
  return {
    isTestMode: ctx.isTestMode,
    async listProcesses() {
      const { data: opps } = await supabase.from("opportunities").select("id")
        .eq("organization_id", ctx.organizationId).eq("contact_id", ctx.contactId).is("deleted_at", null).limit(20);
      const ids = (opps ?? []).map((o: { id: string }) => o.id);
      if (!ids.length) return [];
      // Mesma consulta e mesma ordem do bloco PROCESSOS DO CLIENTE.
      const { data } = await supabase.from("nammux_process_snapshots")
        .select("opportunity_id")
        .eq("organization_id", ctx.organizationId)
        .in("opportunity_id", ids)
        .order("source_updated_at", { ascending: false, nullsFirst: false })
        .limit(5);
      return (data ?? []) as NammuxProcessRef[];
    },
    async fetchSlots(opportunityId) {
      const res = await nammuxSignedPost(supabase, ctx.organizationId, "seialz-interview-slots", {
        seialz_opportunity_id: opportunityId,
      });
      if (!res.ok) {
        console.warn("[nammux-agent-tools] consulta de horários falhou", res.reason, res.status ?? "");
        return null;
      }
      return parseSlots(res.data);
    },
    async requestInterview(opportunityId, startAt, endAt) {
      const { data, error } = await supabase.rpc("nammux_request_interview", {
        _organization_id: ctx.organizationId,
        _opportunity_id: opportunityId,
        _contact_id: ctx.contactId,
        _thread_id: ctx.threadId,
        _start_at: startAt,
        _end_at: endAt,
      });
      if (error) {
        console.warn("[nammux-agent-tools] pedido de entrevista falhou", error.code ?? "sem_codigo");
        return null;
      }
      return typeof data?.status === "string" ? data.status : null;
    },
  };
}
