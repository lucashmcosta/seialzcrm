import { lazy, Suspense, useState } from 'react';
import { SpinnerGap } from '@phosphor-icons/react';
import { useOrganization } from '@/hooks/useOrganization';
import { cn } from '@/lib/utils';
import type { WidgetContext } from '../types';
import { conversaDoContexto } from './enviarNaConversa';

// Carregados sob demanda: o registro de widgets fica na raiz do app e não deve levar o formulário junto.
// Com chunk que não carrega, o guard de chunk do main.tsx engole o erro e o import resolve undefined: vira erro
// claro para o WidgetErrorBoundary da janela.
const PlamevQuoteForm = lazy(() => import('./PlamevQuoteForm').then((m) => {
  if (!m) throw new Error('Failed to fetch dynamically imported module: PlamevQuoteForm');
  return { default: m.PlamevQuoteForm };
}));
const RedeCredenciada = lazy(() => import('./RedeCredenciada').then((m) => {
  if (!m) throw new Error('Failed to fetch dynamically imported module: RedeCredenciada');
  return { default: m.RedeCredenciada };
}));

const ABAS = [
  { id: 'cotacao', nome: 'Cotação' },
  { id: 'rede', nome: 'Rede credenciada' },
] as const;
type Aba = typeof ABAS[number]['id'];

/**
 * Plamev na janela do Workspace. Funciona em qualquer tela (contextMode 'none'); numa oportunidade preenche com o
 * contato dela e salva a cotação nela; numa conversa/contato só preenche e mostra as cotações do contato. Dentro da
 * conversa, a rede credenciada pode ir direto para o cliente.
 */
export function PlamevQuoteWidget({ context }: { context: WidgetContext }) {
  const { organization } = useOrganization();
  const [aba, setAba] = useState<Aba>('cotacao');
  // Cada aba monta na primeira vez que abre e depois fica montada (escondida): trocar de aba não perde o que foi digitado.
  const [abertas, setAbertas] = useState<Set<Aba>>(() => new Set<Aba>(['cotacao']));
  if (!organization?.id) return null;
  const opportunityId = context.screen === 'opportunities' ? context.opportunityId : null;
  const contactId = 'contactId' in context ? context.contactId : null;
  // key: trocar de oportunidade/contato começa do zero
  const chave = opportunityId ?? contactId ?? 'livre';
  const abrir = (a: Aba) => {
    setAba(a);
    setAbertas((atual) => (atual.has(a) ? atual : new Set([...atual, a])));
  };

  return (
    <div className="space-y-3">
      <div role="tablist" className="flex gap-1 border-b border-border">
        {ABAS.map((a) => (
          <button key={a.id} type="button" role="tab" aria-selected={aba === a.id} onClick={() => abrir(a.id)}
            className={cn('-mb-px border-b-2 px-2.5 py-1.5 text-xs font-medium transition-colors',
              aba === a.id ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground')}>
            {a.nome}
          </button>
        ))}
      </div>
      <Suspense fallback={<SpinnerGap className="h-5 w-5 animate-spin text-muted-foreground" />}>
        <div className={aba === 'cotacao' ? undefined : 'hidden'}>
          <PlamevQuoteForm key={chave} organizationId={organization.id} opportunityId={opportunityId} contactId={contactId} />
        </div>
        {abertas.has('rede') && (
          <div className={aba === 'rede' ? undefined : 'hidden'}>
            <RedeCredenciada key={chave} organizationId={organization.id} opportunityId={opportunityId} contactId={contactId}
              conversa={conversaDoContexto(context)} />
          </div>
        )}
      </Suspense>
    </div>
  );
}
