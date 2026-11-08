// Ficha lateral do Comercial: dados do contato da conversa aberta, editáveis sem
// sair do chat. Fase 1: contato + campos personalizados. Fases seguintes
// (oportunidade, nota/tarefa) entram como novas seções aqui.
// Mesmo padrão visual do painel lateral do Atendimento (InboxThreadDetail).
import { usePermissions } from '@/hooks/usePermissions';
import { CustomFieldsCard } from '@/components/custom-fields/CustomFieldsCard';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { ContactQuickEdit } from './ContactQuickEdit';

export function CommercialFichaPanel({
  open,
  contactId,
  onContactChanged,
}: {
  open: boolean;
  contactId: string | null | undefined;
  onContactChanged?: () => void;
}) {
  useUiLocale();
  const { permissions } = usePermissions();

  return (
    <aside
      className={`${open ? 'w-[320px] border-l' : 'w-0 border-l-0'} hidden xl:block border-border overflow-hidden flex-shrink-0 transition-[width] duration-200 ease-in-out bg-background`}
      aria-hidden={!open}
    >
      {open && (
        <div className="w-[320px] h-full overflow-y-auto">
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
