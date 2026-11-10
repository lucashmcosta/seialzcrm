// Mensagem interativa enviada (botões, lista ou botão de link), no estilo do cartão de template.
import { ArrowBendUpLeft, ArrowSquareOut, ListBullets } from '@phosphor-icons/react';
import { interactiveOptions, type InteractivePayload } from '../../../supabase/functions/_shared/whatsapp-interactive';

export function InteractiveMessageCard({ payload }: { payload: InteractivePayload }) {
  const options = interactiveOptions(payload);
  return (
    <div className="w-[300px] max-w-full overflow-hidden rounded-lg" aria-label="Mensagem com opções">
      <div className="space-y-1 py-2 text-sm whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
        {payload.header && <div className="font-semibold">{payload.header}</div>}
        <div>{payload.body || <span className="opacity-50">Texto da mensagem</span>}</div>
        {payload.footer && <div className="text-xs opacity-65">{payload.footer}</div>}
      </div>
      <div className="divide-y divide-current/10 border-t border-current/10">
        {payload.kind === 'buttons' && options.map((o, i) => (
          <div key={i} className="flex min-h-10 items-center justify-center gap-2 px-2 py-2 text-sm font-medium text-blue-700 dark:text-blue-300">
            <ArrowBendUpLeft size={16} aria-hidden="true" /><span className="break-words">{o.title || `Botão ${i + 1}`}</span>
          </div>
        ))}
        {payload.kind === 'cta_url' && (
          <div className="flex min-h-10 items-center justify-center gap-2 px-2 py-2 text-sm font-medium text-blue-700 dark:text-blue-300" title={payload.url}>
            <ArrowSquareOut size={16} aria-hidden="true" /><span className="break-words">{payload.displayText || 'Botão do link'}</span>
          </div>
        )}
        {payload.kind === 'list' && (
          <details className="group">
            <summary className="flex min-h-10 cursor-pointer list-none items-center justify-center gap-2 px-2 py-2 text-sm font-medium text-blue-700 dark:text-blue-300">
              <ListBullets size={16} aria-hidden="true" /><span>{payload.buttonText || 'Ver opções'}</span>
            </summary>
            <ol className="space-y-1 border-t border-current/10 px-3 py-2 text-xs">
              {options.map((o, i) => (
                <li key={i}>
                  <span className="font-medium">{o.title || `Opção ${i + 1}`}</span>
                  {o.description && <span className="block opacity-70">{o.description}</span>}
                </li>
              ))}
            </ol>
          </details>
        )}
      </div>
    </div>
  );
}

/** Selo para a resposta da cliente a botões ou lista. */
export function InteractiveReplyBadge({ kind }: { kind: string }) {
  const label = kind === 'list' ? 'Escolheu na lista' : 'Tocou no botão';
  return <span className="mb-1 inline-flex items-center gap-1 text-[11px] opacity-70"><ArrowBendUpLeft size={12} aria-hidden="true" />{label}</span>;
}
