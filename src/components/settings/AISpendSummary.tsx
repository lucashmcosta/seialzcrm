// Gasto estimado da chave própria no mês. Completo em Provedores de IA; uma linha no card
// de Integrações. Só mostra o que passou pela chave do cliente.
import { useState } from 'react';
import { getUiLocale, uiText, useUiLocale } from '@/lib/ui-locale';
import { budgetUsage, formatUsd, type AiProviderSpend } from '@/lib/aiSpend';

const ACTION_LABELS: Record<string, string> = {
  improve_text: 'Melhorar texto',
  suggest_reply: 'Sugerir resposta',
  summarize_contact: 'Resumo de contato',
  analyze_opportunity: 'Análise de oportunidade',
  generate_email: 'Gerar e-mail',
  generate_agent_prompt: 'Criar prompt do agente',
  refine_agent_prompt: 'Ajustar prompt do agente',
  analyze_message: 'Análise de mensagens',
  transcribe_audio: 'Transcrição de áudios',
  transcribe_call: 'Transcrição de ligações',
  pilot_analyze_audio: 'Análise de áudios (piloto)',
  pilot_transcribe_audio: 'Transcrição de áudios (piloto)',
  pilot_journey_synthesis: 'Resumo da jornada (piloto)',
};

const usd = (value: number) => formatUsd(value, getUiLocale() === 'en-US' ? 'en-US' : 'pt-BR');

function spentLabel(spend: AiProviderSpend | undefined, budget: number | null | undefined) {
  const cost = usd(spend?.costUsd ?? 0);
  return budget ? uiText('{0} de {1} este mês', { 0: cost, 1: usd(Number(budget)) }) : uiText('{0} este mês', { 0: cost });
}

export function AISpendLine({ spend, budget }: { spend?: AiProviderSpend; budget?: number | null }) {
  useUiLocale();
  return <p className="text-xs text-muted-foreground">{uiText('Estimativa')}: {spentLabel(spend, budget)}</p>;
}

export function AISpendSummary({ spend, budget, loading, failed }: {
  spend?: AiProviderSpend;
  budget?: number | null;
  loading: boolean;
  failed: boolean;
}) {
  useUiLocale();
  const [open, setOpen] = useState(false);
  if (loading) return <p className="text-xs text-muted-foreground">{uiText('Calculando gasto...')}</p>;
  if (failed) return <p className="text-xs text-muted-foreground">{uiText('Não foi possível carregar o gasto agora.')}</p>;

  const { percent, level } = budgetUsage(spend?.costUsd ?? 0, budget);
  const barColor = level === 'exceeded' ? 'bg-destructive' : level === 'warning' ? 'bg-amber-500' : 'bg-primary';
  const actions = spend?.actions ?? [];

  return (
    <div className="space-y-2 rounded-md border border-border p-3">
      <div>
        <p className="text-[11px] text-muted-foreground">{uiText('Gasto estimado do mês')}</p>
        <p className="text-sm font-medium">{spentLabel(spend, budget)}</p>
      </div>
      {level !== 'none' && (
        <div
          className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
        >
          <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
        </div>
      )}
      {actions.length > 0 && (
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setOpen((v) => !v)}>
          {open ? uiText('Esconder detalhes') : uiText('Ver por função')}
        </button>
      )}
      {open && (
        <ul className="space-y-1 text-xs">
          {actions.map((a) => (
            <li key={a.action} className="flex items-baseline justify-between gap-3">
              <span>{ACTION_LABELS[a.action] ? uiText(ACTION_LABELS[a.action]) : a.action}</span>
              <span className="shrink-0 text-muted-foreground">
                {a.calls === 1 ? uiText('1 chamada') : uiText('{0} chamadas', { 0: a.calls })} · {usd(a.costUsd)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {(spend?.callsWithoutCost ?? 0) > 0 && (
        <p className="text-[11px] text-muted-foreground">
          {uiText('{0} chamadas sem custo estimado não entram neste valor.', { 0: spend!.callsWithoutCost })}
        </p>
      )}
      <p className="text-[11px] text-muted-foreground">
        {uiText('Estimativa por uso. A fatura do provedor pode ser um pouco diferente.')}
      </p>
    </div>
  );
}
