import { ContactAttachments } from '@/components/contacts/ContactAttachments';
import { DocumentChecklist } from '@/components/documents/DocumentChecklist';

interface Props {
  contactId?: string | null;
  opportunityId?: string | null;
}

export function UnifiedDocuments({ contactId, opportunityId }: Props) {
  return (
    <div className="space-y-5">
      {opportunityId && <section className="space-y-2"><h3 className="text-sm font-semibold">Arquivos da oportunidade</h3><ContactAttachments entityId={opportunityId} entityType="opportunity" /></section>}
      {contactId && <section className="space-y-2"><h3 className="text-sm font-semibold">Arquivos do contato</h3><ContactAttachments contactId={contactId} /></section>}
      {contactId && (
        <section className="space-y-2"><h3 className="text-sm font-semibold">Classificação e checklist</h3><DocumentChecklist contactId={contactId} /></section>
      )}
      {!opportunityId && !contactId && <p className="text-sm text-muted-foreground">Nenhum vínculo disponível.</p>}
    </div>
  );
}
