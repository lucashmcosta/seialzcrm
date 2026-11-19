// Consulta na hora ao Nammux: próximas datas e linha do tempo do processo
// (edge function `seialz-process-info`). O Seialz não guarda cópia da agenda
// nem das movimentações: o Nammux é o dono e responde com o estado de agora,
// já com o título e a explicação em linguagem simples (mesmo catálogo do app).
// Sem dependências de Deno no parse, para os testes.
import { nammuxSignedPost } from "./nammux-client.ts";
import type { NammuxAgendaRow } from "./nammux-process-context.ts";

export const PROCESS_INFO_FUNCTION = "seialz-process-info";
export const PROCESS_INFO_MAX_IDS = 5;

export interface NammuxTimelineItem {
  opportunity_id: string;
  at: string;
  title: string;
  description: string | null;
  /** Decisão sensível (sentença, arquivamento, extinção…): o agente não explica, passa para o escritório. */
  attention: boolean;
}

export interface NammuxProcessInfo {
  agenda: NammuxAgendaRow[];
  timeline: NammuxTimelineItem[];
}

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const isDate = (v: unknown) => typeof v === "string" && !isNaN(new Date(v).getTime());

/** Resposta do Nammux em formato conhecido, ou null se vier fora do contrato. */
export function parseProcessInfo(data: Record<string, unknown> | null): NammuxProcessInfo | null {
  if (!data || !Array.isArray(data.processes)) return null;
  const agenda: NammuxAgendaRow[] = [];
  const timeline: NammuxTimelineItem[] = [];
  for (const raw of data.processes as unknown[]) {
    const p = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
    const opp = str(p.seialz_opportunity_id);
    if (!opp) continue;
    for (const evRaw of Array.isArray(p.agenda) ? p.agenda : []) {
      const e = (evRaw && typeof evRaw === "object" ? evRaw : {}) as Record<string, unknown>;
      const type = str(e.type);
      if (!type || !isDate(e.start_at)) continue;
      agenda.push({
        opportunity_id: opp,
        event_type: type,
        subtype: str(e.subtype),
        start_at: e.start_at as string,
        all_day: e.all_day === true,
        timezone: str(e.timezone),
        modality: str(e.modality),
        location: str(e.location),
        virtual_link: str(e.virtual_link),
      });
    }
    for (const tRaw of Array.isArray(p.timeline) ? p.timeline : []) {
      const t = (tRaw && typeof tRaw === "object" ? tRaw : {}) as Record<string, unknown>;
      const title = str(t.title);
      if (!title || !isDate(t.at)) continue;
      timeline.push({ opportunity_id: opp, at: t.at as string, title, description: str(t.description), attention: t.attention === true });
    }
  }
  agenda.sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());
  timeline.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return { agenda: agenda.slice(0, 10), timeline: timeline.slice(0, 10) };
}

/** null = não foi possível consultar o Nammux agora. */
export async function fetchNammuxProcessInfo(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  organizationId: string,
  opportunityIds: string[],
  include: Array<"summary" | "agenda" | "timeline">,
): Promise<NammuxProcessInfo | null> {
  const ids = opportunityIds.slice(0, PROCESS_INFO_MAX_IDS);
  if (!ids.length) return { agenda: [], timeline: [] };
  const res = await nammuxSignedPost(supabase, organizationId, PROCESS_INFO_FUNCTION, { seialz_opportunity_ids: ids, include });
  if (!res.ok) {
    console.warn("[nammux-process-info] consulta falhou", res.reason, res.status ?? "");
    return null;
  }
  return parseProcessInfo(res.data);
}
