// Ficha lateral do Comercial: tudo do contato da conversa aberta, sem sair do chat.
// Duas visões no mesmo painel:
//  - resumo: edição rápida (nome, e-mail, CPF) + campos personalizados;
//  - completo: o MESMO formulário da tela de contato (ContactFormView embedded),
//    então as regras (CPF, duplicidade, endereço, verificação) são as mesmas.
// Resumo: contato, campos, oportunidades abertas (Fase 2), nota rápida e tarefas (Fase 3).
// < 1536px abre como gaveta por cima do chat; ≥ 1536px fica ao lado (como no Atendimento).
import { useEffect, useState } from 'react';
import { ArrowLeft, X } from '@phosphor-icons/react';
import { useQueryClient } from '@tanstack/react-query';
import { usePermissions } from '@/hooks/usePermissions';
import { CustomFieldsCard } from '@/components/custom-fields/CustomFieldsCard';
import { ContactFormView } from '@/pages/contacts/ContactForm';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { ContactQuickEdit } from './ContactQuickEdit';
import { OpportunitySection, type FichaOpp } from './OpportunitySection';
import { NoteQuickAdd } from './NoteQuickAdd';
import { ContactTasks } from '@/components/contacts/ContactTasks';

type View = 'summary' | 'full';

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
  onAddNote,
}: {
  open: boolean;
  contactId: string | null | undefined;
  onContactChanged?: () => void;
  onClose: () => void;
  opportunities: FichaOpp[];
  stages: Array<{ id: string; name: string }>;
  onWon: (opp: FichaOpp) => void;
  onLost: (opp: FichaOpp) => void;
  onMoveStage: (opp: FichaOpp) => void;
  onOpportunityUpdated: (id: string, patch: Partial<FichaOpp>) => void;
  onAddNote: (text: string) => Promise<boolean>;
}) {
  useUiLocale();
  const { permissions } = usePermissions();
  const qc = useQueryClient();
  const [view, setView] = useState<View>('summary');

  // Trocar de conversa volta pro resumo (não deixa o formulário de outro contato aberto).
  useEffect(() => { setView('summary'); }, [contactId]);

  const backFromFull = () => {
    setView('summary');
    if (contactId) {
      void qc.invalidateQueries({ queryKey: ['ficha-contact', contactId] });
      void qc.invalidateQueries({ queryKey: ['custom-field-values', 'contacts', contactId] });
    }
    onContactChanged?.();
  };

  const width = view === 'full' ? 'w-[420px]' : 'w-[320px]';

  return (
    <aside
      className={`${open ? `${width} border-l shadow-xl 2xl:shadow-none` : 'w-0 border-l-0'} hidden lg:block absolute right-0 top-0 bottom-0 z-30 2xl:static 2xl:z-auto border-border overflow-hidden flex-shrink-0 transition-[width] duration-200 ease-in-out bg-background`}
      aria-hidden={!open}
    >
      {open && (
        <div className={`${width} h-full overflow-y-auto`}>
          <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
            <div className="flex items-center gap-1 min-w-0">
              {view === 'full' && (
                <button
                  type="button"
                  onClick={() => setView('summary')}
                  className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                  aria-label={uiText('Voltar')}
                  title={uiText('Voltar')}
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
              )}
              <h2 className="text-sm font-semibold truncate">
                {view === 'full' ? uiText('Cadastro completo') : uiText('Ficha')}
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label={uiText('Fechar ficha')}
              title={uiText('Fechar ficha')}
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {!contactId ? (
            <p className="px-4 py-5 text-xs text-muted-foreground">{uiText('Esta conversa não tem contato vinculado.')}</p>
          ) : view === 'full' ? (
            <div className="px-4 py-5">
              <ContactFormView key={`full-${contactId}`} contactId={contactId} embedded onDone={backFromFull} />
            </div>
          ) : (
            <div className="px-4 py-5 space-y-6">
              <ContactQuickEdit
                key={contactId}
                contactId={contactId}
                canEdit={permissions.canEditContacts}
                onSaved={onContactChanged}
                onEditFull={() => setView('full')}
              />
              <CustomFieldsCard key={`cf-${contactId}`} module="contacts" recordId={contactId} title={uiText('Campos personalizados')} compact />
              <OpportunitySection
                opportunities={opportunities}
                stages={stages}
                canEdit={permissions.canEditOpportunities}
                onWon={onWon}
                onLost={onLost}
                onMoveStage={onMoveStage}
                onUpdated={onOpportunityUpdated}
              />
              <NoteQuickAdd onAddNote={onAddNote} />
              <ContactTasks key={`tasks-${contactId}`} contactId={contactId} compact />
            </div>
          )}
        </div>
      )}
    </aside>
  );
}
