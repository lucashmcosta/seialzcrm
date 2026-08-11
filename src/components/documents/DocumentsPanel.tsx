import { useQuery } from '@tanstack/react-query';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, DownloadSimple, TrashSimple, Eye, CheckCircle, Warning, UploadSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useEntityDocuments, docDisplayName, type DocEntityType, type EntityDoc } from '@/hooks/documents/useEntityDocuments';
import { DocumentUploadWizard } from '@/components/documents/DocumentUploadWizard';
import { evaluateOpportunityClose, type OpportunityCloseItem } from '@/lib/opportunityClose';
import type { ReferenceInput } from '@/lib/documentName';

interface Props {
  contactId?: string | null;
  opportunityId?: string | null;
}

// Superfície única de Documentos. Na oportunidade: 2 grupos (documentos do contato +
// documentos da própria oportunidade). Upload por WIZARD. "Documentos necessários" vem
// da REGRA DE FECHAMENTO (evaluator), só na oportunidade — não do catálogo.
export function DocumentsPanel({ contactId, opportunityId }: Props) {
  const { organization } = useOrganization();

  const { data: partyName } = useQuery({
    queryKey: ['doc-party-name', contactId],
    enabled: !!contactId,
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('first_name,last_name,full_name').eq('id', contactId!).maybeSingle();
      if (!data) return null;
      const fromParts = [data.first_name, data.last_name].filter(Boolean).join(' ').trim();
      return fromParts || data.full_name || null;
    },
  });

  // Necessários dirigidos pela regra de fechamento (só na oportunidade).
  const { data: evaluation } = useQuery({
    queryKey: ['opp-close-eval', opportunityId],
    enabled: !!opportunityId && !!organization?.id,
    queryFn: () => evaluateOpportunityClose(organization!.id, opportunityId!),
  });
  const requiredItems = (evaluation?.items ?? []).filter((i) => i.action === 'edit_documents' && i.document_type_id);

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
            requiredItems={requiredItems}
          />
        )}
        <DocumentsGroup
          title="Documentos da oportunidade"
          subtitle="Exclusivos desta oportunidade."
          entityType="opportunity"
          entityId={opportunityId}
          partyName={partyName}
          requiredItems={requiredItems}
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
  requiredItems,
}: {
  title: string;
  subtitle?: string;
  entityType: DocEntityType;
  entityId: string;
  partyName?: string | null;
  requiredItems?: OpportunityCloseItem[];
}) {
  const { documents, types, isLoading, upload, remove, download, getSignedUrl } = useEntityDocuments(entityType, entityId);
  const busy = upload.isPending || remove.isPending;

  const ownerTypes = types.filter((t) => t.owner_type === entityType);
  const ownerTypeIds = new Set(ownerTypes.map((t) => t.id));
  const typeName = new Map(types.map((t) => [t.id, t.name] as const));

  // Necessários deste grupo: itens da regra cujo tipo pertence a este owner.
  const groupRequired = (requiredItems ?? []).filter((it) => it.document_type_id && ownerTypeIds.has(it.document_type_id));

  const doUpload = (input: { file: File; documentTypeId?: string | null; reference?: ReferenceInput; partyName?: string | null; isIncomplete?: boolean }) =>
    upload.mutateAsync(input);
  const doRemove = (doc: EntityDoc) => remove.mutate(doc, { onError: (e: unknown) => toast.error((e as Error)?.message || 'Falha ao remover') });
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
      ) : (
        <>
          {groupRequired.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Documentos necessários</p>
              <div className="border rounded-lg divide-y">
                {groupRequired.map((it) => {
                  const sent = it.status === 'passed';
                  // Doc do tipo já existe mas está incompleto (ex.: two_sides só com a frente).
                  const incomplete = !sent && documents.some((d) => d.document_type_id === it.document_type_id && d.is_incomplete);
                  const twoSides = ownerTypes.find((t) => t.id === it.document_type_id)?.has_two_sides;
                  return (
                    <div key={it.code} className="flex items-center justify-between gap-3 p-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium truncate">{it.label}</span>
                        {incomplete && (
                          <span className="text-[11px] text-amber-600 truncate">{twoSides ? '· falta o verso' : '· incompleto'}</span>
                        )}
                      </div>
                      {sent ? (
                        <Badge variant="outline" className="gap-1 text-[10px] shrink-0"><CheckCircle className="h-3 w-3 text-green-500" />Enviado</Badge>
                      ) : (
                        <div className="flex items-center gap-2 shrink-0">
                          {incomplete ? (
                            <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700"><Warning className="h-3 w-3" />Incompleto</Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1 text-[10px]"><Warning className="h-3 w-3" />Pendente</Badge>
                          )}
                          {/* Enviar já amarrado ao tipo exigido — some dúvida sobre "qual tipo escolher". */}
                          <DocumentUploadWizard
                            types={ownerTypes}
                            partyName={partyName}
                            busy={busy}
                            onUpload={doUpload}
                            initialTypeId={it.document_type_id}
                            lockType
                            trigger={<Button type="button" size="sm" className="h-7"><UploadSimple className="h-3.5 w-3.5 mr-1" />{incomplete ? 'Completar' : 'Enviar'}</Button>}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {groupRequired.length > 0 && (
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Documentos enviados</p>
            )}
            {documents.length === 0 ? (
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
          </div>
        </>
      )}
    </Card>
  );
}
