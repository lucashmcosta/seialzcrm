// Carrega o estado ATUAL do assunto de um aviso e monta o texto. Usado pelo
// worker (na hora de enviar) e pela tela de revisão (na prévia): a pessoa que
// aprova vê exatamente o que o cliente vai receber.
import type { NoticeRow } from "./nammux-notice-core.ts";
import {
  type EventState,
  type NoticeKind,
  renderEventNotice,
  renderFinanceNotice,
  renderInterviewNotice,
  renderInterviewOutreachNotice,
  renderMovementNotice,
  type RenderResult,
} from "./nammux-notice-texts.ts";

type Subject = Pick<NoticeRow, "organization_id" | "kind" | "subject_type" | "subject_id" | "subject_start_at" | "payload">;

/**
 * Compromisso que veio no pedido do Nammux (`client.notice.requested`). O Nammux
 * monta o estado na hora de pedir o envio, então não há o que conferir aqui
 * contra outra data: o texto sai do que veio.
 */
export function eventStateFromSource(payload: unknown): EventState | null {
  const p = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  const type = str(p.type), status = str(p.status), start = str(p.start_at);
  if (!type || !status || !start || isNaN(new Date(start).getTime())) return null;
  return {
    event_type: type,
    status,
    start_at: start,
    all_day: p.all_day === true,
    timezone: str(p.timezone),
    modality: str(p.modality),
    location: str(p.location),
    virtual_link: str(p.virtual_link),
    removed_at: null,
  };
}

// deno-lint-ignore no-explicit-any
export async function renderNoticeFromDb(supabase: any, notice: Subject): Promise<RenderResult> {
  const kind = notice.kind as NoticeKind;
  const org = notice.organization_id;

  if (notice.subject_type === "source_event") {
    const state = eventStateFromSource(notice.payload);
    return state ? renderEventNotice(kind, state, null) : { ok: false, reason: "missing_data" };
  }

  if (notice.subject_type === "event") {
    const { data } = await supabase.from("nammux_process_events")
      .select("event_type, status, start_at, all_day, timezone, modality, location, virtual_link, removed_at")
      .eq("id", notice.subject_id).eq("organization_id", org).maybeSingle();
    return data ? renderEventNotice(kind, data, notice.subject_start_at) : { ok: false, reason: "subject_gone" };
  }

  if (notice.subject_type === "finance") {
    const { data } = await supabase.from("nammux_process_finance")
      .select("kind, status, number, installments_count, effective_due_date, due_date, paid_on, manifestation_due_date, homologated_on, amount, reversed, parent_external_id")
      .eq("id", notice.subject_id).eq("organization_id", org).maybeSingle();
    if (!data) return { ok: false, reason: "subject_gone" };
    // "Parcela 2 de 6": o total está no acordo.
    if (data.kind === "installment" && data.parent_external_id) {
      const { data: agreement } = await supabase.from("nammux_process_finance")
        .select("installments_count")
        .eq("organization_id", org).eq("kind", "agreement").eq("external_id", data.parent_external_id).maybeSingle();
      data.installments_count = agreement?.installments_count ?? null;
    }
    return renderFinanceNotice(kind, data);
  }

  if (notice.subject_type === "movement") {
    const { data } = await supabase.from("nammux_process_movements")
      .select("text").eq("id", notice.subject_id).eq("organization_id", org).maybeSingle();
    return data ? renderMovementNotice(kind, data) : { ok: false, reason: "subject_gone" };
  }

  if (notice.subject_type === "interview_request") {
    const { data } = await supabase.from("nammux_interview_requests")
      .select("status, requested_start_at").eq("id", notice.subject_id).eq("organization_id", org).maybeSingle();
    return data ? renderInterviewNotice(kind, data) : { ok: false, reason: "subject_gone" };
  }

  if (notice.subject_type === "opportunity") {
    const { data, error } = await supabase.rpc("nammux_interview_still_waiting", {
      _organization_id: org, _opportunity_id: notice.subject_id,
    });
    if (error) return { ok: false, reason: "missing_data" };
    return renderInterviewOutreachNotice(kind, data === true);
  }

  return { ok: false, reason: "kind_mismatch" };
}
