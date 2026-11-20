import { supabase } from '@/integrations/supabase/client';

/** Avisos automáticos ao cliente (integração Nammux) que precisam de uma pessoa. */
export type NoticeItem = {
  id: string;
  kind: string;
  status: 'pending_approval' | 'needs_review' | 'dead_letter' | 'skipped';
  statusReason: string | null;
  sendAt: string;
  expiresAt: string | null;
  attempts: number;
  channel: string | null;
  lastError: string | null;
  createdAt: string;
  contactId: string;
  contactName: string | null;
  opportunityId: string | null;
  /** O texto que o cliente receberia agora; null quando o aviso perdeu o sentido. */
  preview: string | null;
  previewProblem: string | null;
  canApprove: boolean;
};

/** Aviso barrado porque o contato não é a parte do processo (vínculo possivelmente errado). */
export const isNameMismatch = (item: Pick<NoticeItem, 'status' | 'statusReason'>) =>
  item.status === 'needs_review' && item.statusReason === 'contact_name_mismatch';

export const NAMMUX_NOTICES_FLAG = 'nammux_notices';
export const NAMMUX_NOTICES_QUERY_KEY = ['nammux-notices'] as const;

const KIND_LABEL: Record<string, string> = {
  event_scheduled: 'Compromisso marcado',
  event_rescheduled: 'Compromisso remarcado',
  event_cancelled: 'Compromisso cancelado',
  event_reminder_7d: 'Lembrete de 7 dias',
  event_reminder_1d: 'Lembrete da véspera',
  event_reminder_1h: 'Lembrete de 1 hora',
  event_starting: 'Está iniciando',
  interview_slot_unavailable: 'Horário de entrevista indisponível',
  agreement_homologated: 'Acordo homologado',
  installment_paid: 'A empresa pagou',
  installment_overdue: 'A empresa não pagou',
  payout_done: 'Repasse feito',
  movement_update: 'Movimentação do processo',
  movement_unfavorable: 'Movimentação desfavorável',
};
export const noticeKindLabel = (kind: string) => KIND_LABEL[kind] ?? kind;

/** Por que o aviso está nesta tela, em uma frase. */
export function noticeSituation(item: Pick<NoticeItem, 'status' | 'statusReason'>): string {
  if (item.status === 'pending_approval') return 'Aguardando aprovação antes de sair.';
  if (item.status === 'dead_letter') return 'Não saiu depois de 5 tentativas.';
  if (item.status === 'needs_review') {
    if (item.statusReason === 'contact_name_mismatch') {
      return 'Não saiu: o nome do cliente não bate com o nome da parte no processo. Pode ser um processo ligado à oportunidade errada. Confira o processo antes de decidir.';
    }
    if (item.statusReason === 'payment_reversed_after_sent') {
      return 'Este aviso já saiu, e depois o pagamento foi estornado. O cliente foi avisado de algo que deixou de valer.';
    }
    return 'Não sabemos se este aviso chegou: o envio ficou sem resposta. Confira com o cliente antes de reenviar.';
  }
  const reason = item.statusReason ?? '';
  if (reason === 'no_template') return 'Não saiu: falta um modelo de WhatsApp aprovado para este tipo de aviso.';
  if (reason === 'no_phone') return 'Não saiu: o contato não tem telefone válido.';
  if (reason === 'no_channel') return 'Não saiu: a organização não tem número de Atendimento ativo.';
  if (reason === 'do_not_contact') return 'Não saiu: o contato pediu para não ser contatado.';
  if (reason === 'contact_gone') return 'Não saiu: o contato não existe mais.';
  if (reason.startsWith('template_problem')) return 'Não saiu: o modelo de WhatsApp deste aviso está com problema na Meta.';
  if (reason === 'missing_data') return 'Não saiu: faltam dados para montar a mensagem.';
  return 'Não saiu.';
}

const PREVIEW_PROBLEM: Record<string, string> = {
  subject_gone: 'O compromisso ou registro deste aviso não vale mais.',
  subject_changed: 'A situação mudou depois que o aviso foi criado; ele não seria mais enviado.',
  missing_data: 'Faltam dados para montar a mensagem.',
};
export const previewProblemText = (problem: string | null) =>
  problem ? (PREVIEW_PROBLEM[problem] ?? 'Não foi possível montar a mensagem.') : null;

const ERRORS: Record<string, string> = {
  forbidden: 'Você não tem permissão para aprovar avisos do Atendimento.',
  unauthorized: 'Sua sessão expirou. Entre novamente.',
  not_found: 'Este aviso não existe mais.',
  already_decided: 'Outra pessoa já decidiu este aviso.',
  not_resendable: 'Este aviso já saiu e não pode ser reenviado. Dê baixa na pendência.',
  invalid_params: 'Dados inválidos.',
};

export class NoticeError extends Error {
  constructor(public code: string) { super(ERRORS[code] ?? `Não foi possível concluir (${code}).`); }
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke('nammux-notices-review', { body });
  if (error) {
    let code = 'unknown';
    try { code = (await (error as any).context?.json())?.code ?? code; } catch { /* ignore */ }
    throw new NoticeError(code);
  }
  return data as T;
}

export const listNotices = (organizationId: string) =>
  call<{ enabled: boolean; items: NoticeItem[] }>({ op: 'list', organizationId });

export const decideNotice = (organizationId: string, noticeId: string, approve: boolean, reason?: string) =>
  call<{ status: string }>({ op: 'decide', organizationId, noticeId, approve, reason: reason?.trim() || null });

/** Quantos avisos esperam uma pessoa (para o contador do menu). Os que só pararam não contam. */
export const pendingCount = (items: NoticeItem[]) => items.filter((i) => i.status !== 'skipped').length;
