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

  // Alternativas de um item exigido (grupo anyOf; single = 1). Fallback p/ o campo antigo.
  const itemTypeIds = (it: OpportunityCloseItem): string[] =>
    it.document_type_ids?.length ? it.document_type_ids : (it.document_type_id ? [it.document_type_id] : []);
  // Necessários deste grupo: itens da regra cujo owner é este grupo (contato/oportunidade).
  const groupRequired = (requiredItems ?? []).filter((it) =>
    it.owner_type ? it.owner_type === entityType : itemTypeIds(it).some((id) => ownerTypeIds.has(id)),
  );

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

  // Ações de arquivo (ver/baixar/excluir) reaproveitadas em qualquer linha.
  const fileActions = (doc: EntityDoc) => (
    <div className="flex items-center gap-1 shrink-0">
      <Button type="button" variant="ghost" size="sm" onClick={() => doPreview(doc)} title="Ver"><Eye className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" size="sm" onClick={() => download(doc)} title="Baixar"><DownloadSimple className="h-4 w-4" /></Button>
      <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => doRemove(doc)} title="Remover"><TrashSimple className="h-4 w-4" /></Button>
    </div>
  );

  const requiredTypeIds = new Set(groupRequired.flatMap(itemTypeIds));
  // Uploads que NÃO são exigidos (arquivo livre ou tipo não exigido) — vão pra "Outros".
  const otherDocs = documents.filter((d) => !d.document_type_id || !requiredTypeIds.has(d.document_type_id));

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
                  const altIds = itemTypeIds(it);                       // alternativas (grupo anyOf) ou 1
                  const altTypes = ownerTypes.filter((t) => altIds.includes(t.id));
                  const isGroup = altTypes.length > 1;
                  const docs = documents.filter((d) => d.document_type_id && altIds.includes(d.document_type_id));
                  const incomplete = !sent && docs.some((d) => d.is_incomplete);
                  // "falta o verso" só faz sentido p/ tipo único de duas faces.
                  const twoSides = !isGroup && !!altTypes[0]?.has_two_sides;
                  const single = docs.length <= 1;
                  const doc = docs[0];
                  const acceptedNames = altTypes.map((t) => t.name).join(' ou ');
                  // Subtítulo: se enviado, o NOME real persistido (vai pro Nammux); senão, os aceitos.
                  const subtitle = doc
                    ? (isGroup ? `${typeName.get(doc.document_type_id ?? '') ?? 'Documento'} · ${docDisplayName(doc)}` : docDisplayName(doc))
                    : (isGroup ? `Aceitos: ${acceptedNames}` : undefined);
                  return (
                    <div key={it.code}>
                      {/* Linha única do documento exigido: status + (Enviar/Completar) + ações do arquivo. */}
                      <div className="flex items-center justify-between gap-3 p-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <FileText className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-sm font-medium truncate">{it.label}</span>
                              {incomplete && (
                                <span className="text-[11px] text-amber-600 shrink-0">{twoSides ? '· falta o verso' : '· incompleto'}</span>
                              )}
                            </div>
                            {subtitle && <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {sent ? (
                            <Badge variant="outline" className="gap-1 text-[10px]"><CheckCircle className="h-3 w-3 text-green-500" />Enviado</Badge>
                          ) : incomplete ? (
                            <Badge variant="outline" className="gap-1 text-[10px] border-amber-300 text-amber-700"><Warning className="h-3 w-3" />Incompleto</Badge>
                          ) : (
                            <Badge variant="secondary" className="gap-1 text-[10px]"><Warning className="h-3 w-3" />Pendente</Badge>
                          )}
                          {!sent && (
                            // Single → tipo travado. Grupo (anyOf) → escolhe entre as alternativas (sem "livre").
                            <DocumentUploadWizard
                              types={altTypes}
                              partyName={partyName}
                              busy={busy}
                              onUpload={doUpload}
                              initialTypeId={isGroup ? undefined : altIds[0]}
                              lockType={!isGroup}
                              hideFree
                              trigger={<Button type="button" size="sm" className="h-7"><UploadSimple className="h-3.5 w-3.5 mr-1" />{incomplete ? 'Completar' : 'Enviar'}</Button>}
                            />
                          )}
                          {/* Um único arquivo do tipo → ações inline na própria linha (sem duplicar). */}
                          {single && doc && fileActions(doc)}
                        </div>
                      </div>
                      {/* Vários arquivos do mesmo tipo (cardinalidade múltipla) → lista abaixo. */}
                      {!single && docs.map((d) => (
                        <div key={d.id} className="flex items-center justify-between gap-3 py-2 pl-9 pr-3">
                          <button type="button" onClick={() => doPreview(d)} className="min-w-0 flex-1 text-left">
                            <span className="text-sm truncate">{docDisplayName(d)}</span>
                          </button>
                          {fileActions(d)}
                        </div>
                      ))}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {otherDocs.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {groupRequired.length > 0 ? 'Outros documentos' : 'Documentos enviados'}
              </p>
              <div className="border rounded-lg divide-y">
                {otherDocs.map((doc) => (
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
                    {fileActions(doc)}
                  </div>
                ))}
              </div>
            </div>
          )}

          {groupRequired.length === 0 && otherDocs.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhum documento enviado.</p>
          )}
        </>
      )}
    </Card>
  );
}
