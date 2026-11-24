// Resposta do cliente ao convite para marcar a entrevista (interview_invite,
// interview_invite_reminder, interview_last_call): botões "Quero marcar" e
// "Falar com a equipe".
//
// Leitura fixa, sem modelo de IA. Só vale se o contato recebeu um desses convites
// há pouco (OUTREACH_REPLY_WINDOW_DAYS). Não responde sozinha: acrescenta uma nota
// à mensagem para o agente seguir (consultar horários ou passar para a equipe).
import { INTERVIEW_BOOK, INTERVIEW_TALK_TEAM } from "./nammux-notice-texts.ts";

export const OUTREACH_REPLY_WINDOW_DAYS = 7;
export const OUTREACH_KINDS = ["interview_invite", "interview_invite_reminder", "interview_last_call"];

export const BOOK_NOTE =
  "[Sistema: o cliente respondeu ao convite para marcar a entrevista do processo. Consulte os horários livres agora e ofereça até 3. Não pergunte se ele quer marcar: ele já disse que quer.]";
export const TALK_TEAM_NOTE =
  "[Sistema: o cliente respondeu ao último aviso da entrevista pedindo para falar com a equipe. Passe para a equipe agora (transfer_to_human), com o resumo começando por [ATENDIMENTO] e dizendo que ele precisa marcar a entrevista.]";

const norm = (s: string) => s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[.!\s]+$/g, "");

export function parseOutreachAnswer(text: unknown): "book" | "team" | null {
  if (typeof text !== "string") return null;
  const t = norm(text);
  if (t === norm(INTERVIEW_BOOK) || ["quero marcar a entrevista", "marcar entrevista", "quero marcar sim"].includes(t)) return "book";
  if (t === norm(INTERVIEW_TALK_TEAM)) return "team";
  return null;
}

export interface OutreachReplyDeps {
  /** Convite de entrevista enviado a este contato nos últimos dias? */
  recentOutreach(): Promise<boolean>;
}

export async function captureOutreachReply(message: unknown, deps: OutreachReplyDeps): Promise<{ note: string; outcome: string } | null> {
  const answer = parseOutreachAnswer(message);
  if (!answer) return null;
  if (!(await deps.recentOutreach())) return null;
  return answer === "book"
    ? { note: BOOK_NOTE, outcome: "interview_outreach_book" }
    : { note: TALK_TEAM_NOTE, outcome: "interview_outreach_team" };
}

export function outreachReplyDeps(
  // deno-lint-ignore no-explicit-any
  supabase: any,
  ctx: { organizationId: string; contactId: string },
): OutreachReplyDeps {
  return {
    async recentOutreach() {
      const { data } = await supabase.from("nammux_notices").select("id")
        .eq("organization_id", ctx.organizationId).eq("contact_id", ctx.contactId)
        .in("kind", OUTREACH_KINDS).eq("status", "sent")
        .gte("sent_at", new Date(Date.now() - OUTREACH_REPLY_WINDOW_DAYS * 86_400_000).toISOString())
        .limit(1);
      return !!data?.length;
    },
  };
}
