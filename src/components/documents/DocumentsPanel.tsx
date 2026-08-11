import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, DownloadSimple, TrashSimple, Eye } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useEntityDocuments, docDisplayName, uploadErrorMessage, type DocEntityType, type EntityDoc } from '@/hooks/documents/useEntityDocuments';
import { DocumentUploadWizard } from '@/components/documents/DocumentUploadWizard';
import type { ReferenceInput } from '@/lib/documentName';

interface Props {
  contactId?: string | null;
  opportunityId?: string | null;
}

// Superfície única de Documentos. Na oportunidade: 2 grupos (documentos do contato +
// documentos da própria oportunidade). Upload por WIZARD (escolhe o tipo ou livre).
// "Documentos necessários" NÃO é o catálogo — vem da regra de fechamento (Etapa 3).
export function DocumentsPanel({ contactId, opportunityId }: Props) {
  // Nome da parte (contato) para gerar o display_name dos documentos.
  const { data: partyName } = useQuery({
    queryKey: ['doc-party-name', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data } = await supabase
        .from('contacts')
        .select('first_name,last_name,full_name')
        .eq('id', contactId!)
        .maybeSingle();
      if (!data) return null;
      const fromParts = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
      return fromParts || data.full_name || null;
    },
  });

  if (opportunityId) {
    return (
      <div className="space-y-5">
        {contactId && (
          <DocumentsGroup
            title="Documentos do contato"
            subtitle="Do contato — visíveis em todas as oportunidades dele."
            entityType="contact"
            entityId={contactId}
            partyName={partyName}
          />
        )}
        <DocumentsGroup
          title="Documentos da oportunidade"
          subtitle="Exclusivos desta oportunidade."
          entityType="opportunity"
          entityId={opportunityId}
          partyName={partyName}
        />
      </div>
    );
  }
  if (contactId) {
    return (
      <div className="space-y-5">
        <DocumentsGroup title="Documentos" entityType="contact" entityId={contactId} partyName={partyName} />
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">Nenhum vínculo disponível.</p>;
}

function DocumentsGroup({
  title,
  subtitle,
  entityType,
  entityId,
  partyName,
}: {
  title: string;
  subtitle?: string;
  entityType: DocEntityType;
  entityId: string;
  partyName?: string | null;
}) {
  const { documents, types, isLoading, upload, remove, download, getSignedUrl } = useEntityDocuments(entityType, entityId);
  const busy = upload.isPending || remove.isPending;

  // Tipos que este grupo pode classificar (owner_type = a entidade).
  const ownerTypes = types.filter((t) => t.owner_type === entityType);
  const typeName = new Map(types.map((t) => [t.id, t.name] as const));

  const doUpload = (input: { file: File; documentTypeId?: string | null; reference?: ReferenceInput; partyName?: string | null }) =>
    upload.mutate(input, {
      onError: (e: unknown) => toast.error(uploadErrorMessage(e)),
      onSuccess: () => toast.success('Documento enviado'),
    });
  const doRemove = (doc: EntityDoc) =>
    remove.mutate(doc, { onError: (e: unknown) => toast.error((e as Error)?.message || 'Falha ao remover') });
  const doPreview = async (doc: EntityDoc) => {
    try {
      const url = await getSignedUrl(doc);
      window.open(url, '_blank', 'noopener');
    } catch (e: unknown) {
      toast.error((e as Error)?.message || 'Não foi possível abrir');
    }
  };

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
        </div>
        <DocumentUploadWizard types={ownerTypes} partyName={partyName} busy={busy} onUpload={doUpload} />
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : documents.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum documento enviado.</p>
      ) : (
        <div className="border rounded-lg divide-y">
          {documents.map((doc) => (
            <div key={doc.id} className="flex items-center justify-between gap-3 p-3">
              <button type="button" onClick={() => doPreview(doc)} className="flex items-start gap-3 min-w-0 flex-1 text-left">
                <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm truncate">{docDisplayName(doc)}</p>
                  <p className="text-[11px] text-muted-foreground truncate">
                    {doc.document_type_id ? typeName.get(doc.document_type_id) ?? 'Documento' : 'Arquivo livre'}
                  </p>
                </div>
              </button>
              <div className="flex items-center gap-1 shrink-0">
                <Button type="button" variant="ghost" size="sm" onClick={() => doPreview(doc)} title="Ver"><Eye className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => download(doc)} title="Baixar"><DownloadSimple className="h-4 w-4" /></Button>
                <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => doRemove(doc)} title="Remover"><TrashSimple className="h-4 w-4" /></Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
