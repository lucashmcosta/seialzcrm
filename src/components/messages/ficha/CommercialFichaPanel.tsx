// Painel Atalhos do Comercial (componente CommercialFichaPanel): tudo da conversa e do
// contato aberto, sem sair do chat. Substitui o menu "Ações" do cabeçalho em telas ≥ 1024px.
// Duas visões no mesmo painel:
//  - resumo: edição rápida (nome, e-mail, CPF) + campos personalizados;
//  - completo: o MESMO formulário da tela de contato (ContactFormView embedded),
//    então as regras (CPF, duplicidade, endereço, verificação) são as mesmas.
// Resumo: contato, campos, oportunidades abertas (Fase 2), nota rápida e tarefas (Fase 3).
// Ao lado do chat ou gaveta por cima: decidido pela regra de espaço do MessagesList (prop inline).
import { useEffect, useState } from 'react';
import { ArrowLeft, CaretDown, X } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';
import { CustomFieldsCard } from '@/components/custom-fields/CustomFieldsCard';
import { ContactFormView } from '@/pages/contacts/ContactForm';
import { DocumentsPanel } from '@/components/documents/DocumentsPanel';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { ContactQuickEdit } from './ContactQuickEdit';
import { OpportunitySection, type FichaOpp } from './OpportunitySection';
import { NoteQuickAdd } from './NoteQuickAdd';
import { ConversationActions, type ConversationActionsProps } from './ConversationActions';
import { ContactTasks } from '@/components/contacts/ContactTasks';

type View = 'summary' | 'full' | { docs: string };

type SectionKey = 'conversation' | 'contact' | 'opportunities';
// Abertas por padrão: Conversa e Contato; Oportunidades começa recolhida. A escolha fica salva por pessoa.
const DEFAULT_OPEN: Record<SectionKey, boolean> = { conversation: true, contact: true, opportunities: false };
const STORAGE_KEY = 'ficha.sections.v1';

function readOpen(): Record<SectionKey, boolean> {
  try {
    const raw = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || '{}');
    return { ...DEFAULT_OPEN, ...(raw && typeof raw === 'object' ? raw : {}) };
  } catch { return { ...DEFAULT_OPEN }; }
}

/** Seção recolhível dos Atalhos: o título vira o botão; o título interno da seção fica escondido. */
function FichaSection({ title, summary, open, onToggle, children }: {
  title: string; summary?: string | null; open: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border-b border-border/60 pb-4 last:border-b-0">
      <button type="button" onClick={onToggle} aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 py-1 text-left">
        <span className="flex min-w-0 items-baseline gap-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</span>
          {!open && summary && <span className="truncate text-xs text-muted-foreground/80 normal-case">{summary}</span>}
        </span>
        <CaretDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open ? 'rotate-180' : '')} />
      </button>
      {open && <div className="pt-3 [&_[data-ficha-title]]:hidden">{children}</div>}
    </div>
  );
}

export function CommercialFichaPanel({
  open,
  contactId,
  onContactChanged,
  onClose,
  opportunities,
  stages,
  onWon,
  onLost,
  onMoveStage,
  onOpportunityUpdated,
  onOpportunityCreated,
  onAddNote,
  conversation,
  inline,
}: {
  open: boolean;
  contactId: string | null | undefined;
  onContactChanged?: () => void;
  onClose: () => void;
  opportunities: FichaOpp[];
  stages: Array<{ id: string; name: string; type?: string | null }>;
  onWon: (opp: FichaOpp) => void;
  onLost: (opp: FichaOpp) => void;
  onMoveStage: (opp: FichaOpp) => void;
  onOpportunityUpdated: (id: string, patch: Partial<FichaOpp>) => void;
  onOpportunityCreated: () => void;
  onAddNote: (text: string) => Promise<boolean>;
  conversation: ConversationActionsProps;
  /** true: coluna ao lado do chat; false: gaveta por cima (quando não há espaço). */
  inline: boolean;
}) {
  useUiLocale();
  const { permissions } = usePermissions();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('summary');
  const [openSections, setOpenSections] = useState<Record<SectionKey, boolean>>(readOpen);
  const toggleSection = (k: SectionKey) => setOpenSections((cur) => {
    const next = { ...cur, [k]: !cur[k] };
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* storage indisponível */ }
    return next;
  });
  // Resumo das oportunidades no cabeçalho recolhido: quantas abertas e a etapa da principal.
  const oppSummary = (() => {
    if (!opportunities.length) return uiText('Nenhuma aberta');
    const stage = stages.find((s) => s.id === opportunities[0].pipeline_stage_id)?.name;
    const count = opportunities.length === 1 ? uiText('1 aberta') : `${opportunities.length} ${uiText('abertas')}`;
    return stage ? `${count} · ${stage}` : count;
  })();
  // Volta de "cadastro completo"/"documentos" reavalia as pendências das oportunidades.
  const [reloadKey, setReloadKey] = useState(0);
  const isDocs = typeof view === 'object';

  // Trocar de conversa volta pro resumo (não deixa o formulário de outro contato aberto).
  useEffect(() => { setView('summary'); }, [contactId]);

  const backToSummary = () => {
    setView('summary');
    setReloadKey((k) => k + 1);
  };

  const backFromFull = () => {
    backToSummary();
    if (contactId) {
      void qc.invalidateQueries({ queryKey: ['ficha-contact', contactId] });
      void qc.invalidateQueries({ queryKey: ['custom-field-values', 'contacts', contactId] });
    }
    onContactChanged?.();
  };

  const width = view === 'full' || isDocs ? 'w-[460px]' : 'w-[360px]';

  return (
    <aside
      className={`${open ? `${width} border-l ${inline ? '' : 'shadow-xl'}` : 'w-0 border-l-0'} block ${inline ? 'static' : 'absolute right-0 top-0 bottom-0 z-30'} border-border overflow-hidden flex-shrink-0 transition-[width] duration-200 ease-in-out bg-background`}
      aria-hidden={!open}
    >
      {open && (
        <div className={`${width} h-full overflow-y-auto`}>
          {/* Cabeçalho só onde precisa voltar (cadastro completo / documentos). No resumo, o próprio
              botão "Atalhos" abre e fecha; em modo gaveta (por cima do chat) fica só um X discreto. */}
          {view !== 'summary' ? (
            <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
              <div className="flex items-center gap-1 min-w-0">
                <button
                  type="button"
                  onClick={backToSummary}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={uiText('Voltar')}
                  title={uiText('Voltar')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <h2 className="text-sm font-semibold truncate">
                  {view === 'full' ? uiText('Cadastro completo') : uiText('Documentos')}
                </h2>
              </div>
              {!inline && (
                <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={uiText('Fechar atalhos')} title={uiText('Fechar atalhos')}>
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          ) : !inline ? (
            <div className="flex justify-end px-2 pt-2">
              <button type="button" onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                aria-label={uiText('Fechar atalhos')} title={uiText('Fechar atalhos')}>
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : null}

          {!contactId ? (
            <div className="px-4 py-5 space-y-6">
              <ConversationActions {...conversation} />
              <p className="text-xs text-muted-foreground">{uiText('Esta conversa não tem contato vinculado.')}</p>
            </div>
          ) : isDocs ? (
            <div className="px-4 py-5">
              <DocumentsPanel key={`docs-${view.docs}`} contactId={contactId} opportunityId={view.docs} />
            </div>
          ) : view === 'full' ? (
            <div className="px-4 py-5">
              <ContactFormView key={`full-${contactId}`} contactId={contactId} embedded onDone={backFromFull} />
            </div>
          ) : (
            <div className="px-4 py-4 space-y-4">
              <FichaSection title={uiText('Conversa')} open={openSections.conversation} onToggle={() => toggleSection('conversation')}>
                <ConversationActions {...conversation} />
              </FichaSection>
              <FichaSection title={uiText('Contato')} open={openSections.contact} onToggle={() => toggleSection('contact')}>
              <ContactQuickEdit
                key={contactId}
                contactId={contactId}
                canEdit={permissions.canEditContacts}
                onSaved={onContactChanged}
                onEditFull={() => setView('full')}
              >
                <CustomFieldsCard key={`cf-${contactId}`} module="contacts" recordId={contactId} compact bare />
              </ContactQuickEdit>
              </FichaSection>
              <FichaSection title={uiText('Oportunidades')} summary={oppSummary} open={openSections.opportunities} onToggle={() => toggleSection('opportunities')}>
              <OpportunitySection
                contactId={contactId}
                opportunities={opportunities}
                stages={stages}
                canEdit={permissions.canEditOpportunities}
                onWon={onWon}
                onLost={onLost}
                onMoveStage={onMoveStage}
                onUpdated={onOpportunityUpdated}
                onCreated={onOpportunityCreated}
                onEditContact={() => setView('full')}
                onOpenDocuments={(oppId) => setView({ docs: oppId })}
                reloadKey={reloadKey}
              />
              </FichaSection>
              {/* Nota e tarefas: ações rápidas, sempre visíveis no fim do painel (não recolhem). */}
              <NoteQuickAdd onAddNote={onAddNote} />
              <ContactTasks key={`tasks-${contactId}`} contactId={contactId} compact />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
