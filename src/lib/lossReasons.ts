import { uiText } from '@/lib/ui-locale';

export type LossDetailMode = 'off' | 'optional' | 'required';

export interface LossReason {
  id: string;
  code: string;
  name: string;
  order_index: number;
  is_active: boolean;
}

export interface LossDetail {
  id: string;
  reason_id: string;
  code: string;
  name: string;
  help_text: string | null;
  order_index: number;
  is_active: boolean;
  requires_description: boolean;
  automation_only: boolean;
}

export interface LossSettings {
  reason_required: boolean;
  detail_mode: LossDetailMode;
}

/** Org sem linha em opportunity_loss_settings usa este padrão (igual ao banco). */
export const DEFAULT_LOSS_SETTINGS: LossSettings = { reason_required: true, detail_mode: 'optional' };

/**
 * Move o item uma posição para cima/baixo e devolve só as linhas cujo order_index mudou.
 * Renumera de 1 em diante, o que também conserta empates antigos.
 */
export function reorderLossItems<T extends { id: string; order_index: number }>(items: T[], id: string, direction: -1 | 1) {
  const ordered = [...items].sort((a, b) => a.order_index - b.order_index);
  const from = ordered.findIndex((item) => item.id === id);
  const to = from + direction;
  if (from < 0 || to < 0 || to >= ordered.length) return [];
  [ordered[from], ordered[to]] = [ordered[to], ordered[from]];
  return ordered
    .map((item, index) => ({ id: item.id, order_index: index + 1, changed: item.order_index !== index + 1 }))
    .filter((item) => item.changed)
    .map(({ id: itemId, order_index }) => ({ id: itemId, order_index }));
}

export const nextOrderIndex = (items: { order_index: number }[]) =>
  items.reduce((max, item) => Math.max(max, item.order_index), 0) + 1;

/** Detalhes que podem entrar numa regra por etapa: ativos e de motivo ativo (só automação incluso). */
export function stageRuleDetailOptions(reasons: LossReason[], details: LossDetail[]) {
  const activeReasons = reasons.filter((r) => r.is_active).sort((a, b) => a.order_index - b.order_index);
  return activeReasons
    .map((reason) => ({
      reason,
      details: details
        .filter((d) => d.reason_id === reason.id && d.is_active)
        .sort((a, b) => a.order_index - b.order_index),
    }))
    .filter((group) => group.details.length > 0);
}

export type StageRuleIssue = 'detail_inactive' | 'reason_inactive' | 'stage_not_open';

export function stageRuleIssueText(issue: StageRuleIssue) {
  switch (issue) {
    case 'reason_inactive': return uiText('o motivo do detalhe está inativo');
    case 'stage_not_open': return uiText('a etapa deixou de ser uma etapa aberta');
    default: return uiText('o detalhe está inativo');
  }
}

/** Códigos de erro que o banco levanta nas regras de perda → texto para a pessoa. null = mensagem genérica. */
export function lossErrorMessage(error: unknown): string | null {
  const raw = (error as { message?: string; code?: string } | null)?.message ?? '';
  const known: Record<string, string> = {
    loss_reason_required: 'Escolha o motivo da perda.',
    loss_detail_required: 'Escolha o detalhe da perda.',
    loss_description_required: 'Este detalhe exige uma descrição.',
    loss_detail_automation_only: 'Este detalhe só pode ser marcado pela automação.',
    loss_detail_disabled: 'O uso de detalhe está desligado nesta organização.',
    loss_detail_inactive: 'Este detalhe está inativo.',
    loss_reason_inactive: 'Este motivo está inativo.',
    loss_detail_reason_mismatch: 'O detalhe escolhido não pertence a este motivo.',
    loss_code_in_use: 'O código já foi usado em alguma oportunidade e não pode mudar.',
    loss_code_immutable: 'O código é gerado automaticamente e não muda.',
    loss_code_too_long: 'O código gerado passaria de 20 caracteres. Fale com o suporte.',
    loss_reason_in_use: 'Motivo já usado não pode ser apagado. Inative-o.',
    loss_detail_in_use: 'Detalhe já usado não pode ser apagado. Inative-o.',
    loss_detail_reason_immutable: 'Detalhe não muda de motivo. Crie um novo detalhe no motivo certo e inative este.',
    loss_rule_stage_invalid: 'A regra só vale para etapas abertas do funil.',
    forbidden_correct_loss: 'Só quem tem a permissão "Corrigir motivo de perda" pode alterar o motivo de uma oportunidade perdida.',
    opportunity_already_lost: 'Esta oportunidade já está perdida.',
    lost_stage_not_found: 'O funil não tem uma etapa de perda. Crie uma em Configurações › Pipeline.',
    loss_not_found: 'Esta oportunidade não está perdida.',
  };
  for (const [code, text] of Object.entries(known)) {
    if (raw.includes(code)) return uiText(text);
  }
  if (raw.includes('opportunity_loss_stage_rules_detail_fkey')) {
    return uiText('Este detalhe está numa regra por etapa. Tire a regra antes de apagar.');
  }
  if (raw.includes('row-level security')) return uiText('Você não tem permissão para alterar os motivos de perda.');
  return null;
}

/**
 * Os tipos gerados tratam todo argumento de RPC como obrigatório e não-nulo; as RPCs de perda aceitam NULL
 * (sem motivo, sem detalhe, sem descrição). Mantém o null tipado sem `any`.
 */
export const rpcNullable = (value: string | null | undefined) => (value ?? null) as string;
