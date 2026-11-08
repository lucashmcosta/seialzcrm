// Ficha lateral do Comercial: dados do contato da conversa aberta, editáveis sem
// sair do chat. Fase 1: contato + campos personalizados. Fases seguintes
// (oportunidade, nota/tarefa) entram como novas seções aqui.
// Mesmo padrão visual do painel lateral do Atendimento (InboxThreadDetail).
import { X } from '@phosphor-icons/react';
import { usePermissions } from '@/hooks/usePermissions';
import { CustomFieldsCard } from '@/components/custom-fields/CustomFieldsCard';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { ContactQuickEdit } from './ContactQuickEdit';

export function CommercialFichaPanel({
  open,
  contactId,
  onContactChanged,
  onClose,
}: {
  open: boolean;
  contactId: string | null | undefined;
  onContactChanged?: () => void;
  onClose: () => void;
}) {
  useUiLocale();
  const { permissions } = usePermissions();

  return (
    <aside
      // < 1536px: gaveta por cima do lado direito do chat (não espreme a conversa).
      // ≥ 1536px (2xl): coluna fixa ao lado do chat, como no Atendimento.
      className={`${open ? 'w-[320px] border-l shadow-xl 2xl:shadow-none' : 'w-0 border-l-0'} hidden lg:block absolute right-0 top-0 bottom-0 z-30 2xl:static 2xl:z-auto border-border overflow-hidden flex-shrink-0 transition-[width] duration-200 ease-in-out bg-background`}
      aria-hidden={!open}
    >
      {open && (
        <div className="w-[320px] h-full overflow-y-auto">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background z-10">
            <h2 className="text-sm font-semibold">{uiText('Ficha')}</h2>
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
          <div className="px-4 py-5 space-y-6">
            {contactId ? (
              <>
                <ContactQuickEdit
                  key={contactId}
                  contactId={contactId}
                  canEdit={permissions.canEditContacts}
                  onSaved={onContactChanged}
                />
                <CustomFieldsCard key={`cf-${contactId}`} module="contacts" recordId={contactId} title={uiText('Campos personalizados')} compact />
              </>
            ) : (
              <p className="text-xs text-muted-foreground">{uiText('Esta conversa não tem contato vinculado.')}</p>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}
