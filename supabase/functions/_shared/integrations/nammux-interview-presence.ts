// Resposta do cliente ao lembrete de véspera da ENTREVISTA:
// "Vou participar" / "Preciso remarcar" (botões do modelo interview_reminder_1d).
//
// Leitura fixa, sem chamar modelo de IA. Só vale quando o contato recebeu esse
// lembrete há pouco (PRESENCE_WINDOW_HOURS) e a entrevista ainda não passou:
// fora disso a mensagem é conversa e segue para o agente.
import { PRESENCE_RESCHEDULE, PRESENCE_YES } from "./nammux-notice-texts.ts";

export const PRESENCE_WINDOW_HOURS = 36;
export const PRESENCE_THANKS =
  "Combinado! A equipe do escritório vai te chamar no horário. Se surgir algum imprevisto, é só avisar por aqui.";
export const RESCHEDULE_NOTE =
  "[Sistema: o cliente respondeu ao lembrete de véspera que precisa remarcar a entrevista. Consulte os horários livres e ofereça outros. Escolher outro horário remarca a entrevista.]";

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.!\s]+$/g, "");

export function parsePresenceAnswer(text: unknown): "yes" | "reschedule" | null {
  if (typeof text !== "string") return null;
  const t = norm(text);
  if (t === norm(PRESENCE_YES) || ["vou", "vou sim", "sim, vou participar", "vou participar sim"].includes(t)) return "yes";
  if (t === norm(PRESENCE_RESCHEDULE) || ["preciso remarcar a entrevista", "quero remarcar", "remarcar"].includes(t)) return "reschedule";
  return null;
}

export interface PresenceDeps {
  /** O lembrete de véspera de entrevista enviado a este contato há pouco, para entrevista que ainda não passou. */
  recentInterviewReminder(): Promise<{ noticeId: string } | null>;
}

export type PresenceResult =
  | { kind: "reply"; text: string; outcome: "interview_presence_yes" }
  | { kind: "continue"; note: string; outcome: "interview_presence_reschedule" };

export async function capturePresence(message: unknown, deps: PresenceDeps): Promise<PresenceResult | null> {
  const answer = parsePresenceAnswer(message);
  if (!answer) return null;
  if (!(await deps.recentInterviewReminder())) return null;
  return answer === "yes"
    ? { kind: "reply", text: PRESENCE_THANKS, outcome: "interview_presence_yes" }
    : { kind: "continue", note: RESCHEDULE_NOTE, outcome: "interview_presence_reschedule" };
}

export function presenceDeps(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ctx: { organizationId: string; contactId: string },
): PresenceDeps {
  return {
    async recentInterviewReminder() {
      const now = Date.now();
      const { data } = await supabase.from("nammux_notices")
        .select("id, subject_id, subject_start_at")
        .eq("organization_id", ctx.organizationId).eq("contact_id", ctx.contactId)
        .eq("kind", "event_reminder_1d").eq("status", "sent").eq("subject_type", "event")
        .gte("sent_at", new Date(now - PRESENCE_WINDOW_HOURS * 3_600_000).toISOString())
        .gt("subject_start_at", new Date(now).toISOString())
        .order("sent_at", { ascending: false }).limit(5);
      const rows = (data ?? []) as Array<{ id: string; subject_id: string }>;
      if (!rows.length) return null;
      const { data: events } = await supabase.from("nammux_process_events").select("id")
        .eq("organization_id", ctx.organizationId).eq("event_type", "entrevista")
        .in("id", rows.map((r) => r.subject_id));
      const ids = new Set(((events ?? []) as Array<{ id: string }>).map((e) => e.id));
      const hit = rows.find((r) => ids.has(r.subject_id));
      return hit ? { noticeId: hit.id } : null;
    },
  };
}
