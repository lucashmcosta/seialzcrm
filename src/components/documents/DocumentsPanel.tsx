import { useRef } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FileText, UploadSimple, DownloadSimple, TrashSimple, Eye, CheckCircle, Warning } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { useEntityDocuments, type DocEntityType, type EntityDoc } from '@/hooks/documents/useEntityDocuments';

interface Props {
  contactId?: string | null;
  opportunityId?: string | null;
}

// Superfície única de Documentos. Na oportunidade, mostra 2 grupos: documentos do contato
// (herdados) + documentos da própria oportunidade. Um único uploader (livre ou por tipo).
export function DocumentsPanel({ contactId, opportunityId }: Props) {
  if (opportunityId) {
    return (
      <div className="space-y-5">
        {contactId && (
          <DocumentsGroup
            title="Documentos do contato"
            subtitle="Do contato — visíveis em todas as oportunidades dele."
            entityType="contact"
            entityId={contactId}
            showRequired
          />
        )}
        <DocumentsGroup
          title="Documentos da oportunidade"
          subtitle="Exclusivos desta oportunidade."
          entityType="opportunity"
          entityId={opportunityId}
        />
      </div>
    );
  }
  if (contactId) {
    return (
      <div className="space-y-5">
        <DocumentsGroup title="Documentos" entityType="contact" entityId={contactId} showRequired />
      </div>
    );
  }
  return <p className="text-sm text-muted-foreground">Nenhum vínculo disponível.</p>;
}

function UploadButton({
  onFile,
  label,
  variant = 'outline',
  size = 'sm',
  disabled,
}: {
  onFile: (file: File) => void;
  label: string;
  variant?: 'outline' | 'default' | 'ghost';
  size?: 'sm' | 'default';
  disabled?: boolean;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <Button type="button" variant={variant} size={size} disabled={disabled} onClick={() => ref.current?.click()}>
        <UploadSimple className="h-4 w-4 mr-1" />
        {label}
      </Button>
      <input
        ref={ref}
        type="file"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
    </>
  );
}

function DocumentsGroup({
  title,
  subtitle,
  entityType,
  entityId,
  showRequired = false,
}: {
  title: string;
  subtitle?: string;
  entityType: DocEntityType;
  entityId: string;
  showRequired?: boolean;
}) {
  const { documents, types, isLoading, upload, remove, download, getSignedUrl } = useEntityDocuments(entityType, entityId);
  const busy = upload.isPending || remove.isPending;

  const byType = new Map<string, EntityDoc>();
  for (const d of documents) if (d.document_type_id) byType.set(d.document_type_id, d);
  const freeDocs = documents.filter((d) => !d.document_type_id);

  const doUpload = (file: File, documentTypeId?: string) =>
    upload.mutate(
      { file, documentTypeId },
      { onError: (e: unknown) => toast.error((e as Error)?.message || 'Falha no upload'), onSuccess: () => toast.success('Arquivo enviado') },
    );
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

  const fileRow = (doc: EntityDoc) => (
    <div key={doc.id} className="flex items-center justify-between gap-3 p-3">
      <button type="button" onClick={() => doPreview(doc)} className="flex items-start gap-3 min-w-0 flex-1 text-left">
        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
        <span className="text-sm truncate">{doc.file_name}</span>
      </button>
      <div className="flex items-center gap-1 shrink-0">
        <Button type="button" variant="ghost" size="sm" onClick={() => doPreview(doc)} title="Ver"><Eye className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => download(doc)} title="Baixar"><DownloadSimple className="h-4 w-4" /></Button>
        <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => doRemove(doc)} title="Remover"><TrashSimple className="h-4 w-4" /></Button>
      </div>
    </div>
  );

  return (
    <Card className="p-4 sm:p-6 space-y-4">
      <div>
        <h3 className="text-base font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>

      {isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <>
          {showRequired && types.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Documentos necessários</p>
              <div className="border rounded-lg divide-y">
                {types.map((t) => {
                  const doc = byType.get(t.id);
                  return (
                    <div key={t.id} className="flex items-center justify-between gap-3 p-3">
                      <div className="flex items-start gap-3 min-w-0 flex-1">
                        <FileText className="h-4 w-4 text-muted-foreground mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-medium truncate">{t.name}</span>
                            {t.is_required && <Badge variant="outline" className="text-[10px]">Obrigatório</Badge>}
                            {doc ? (
                              <Badge variant="outline" className="gap-1 text-[10px]"><CheckCircle className="h-3 w-3 text-green-500" />Enviado</Badge>
                            ) : (
                              <Badge variant="secondary" className="gap-1 text-[10px]"><Warning className="h-3 w-3" />Pendente</Badge>
                            )}
                          </div>
                          {doc && <p className="text-[11px] text-muted-foreground truncate mt-0.5">{doc.file_name}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {doc ? (
                          <>
                            <Button type="button" variant="ghost" size="sm" onClick={() => doPreview(doc)} title="Ver"><Eye className="h-4 w-4" /></Button>
                            <Button type="button" variant="ghost" size="sm" onClick={() => download(doc)} title="Baixar"><DownloadSimple className="h-4 w-4" /></Button>
                            <UploadButton label="Substituir" variant="ghost" disabled={busy} onFile={(f) => doUpload(f, t.id)} />
                            <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => doRemove(doc)} title="Remover"><TrashSimple className="h-4 w-4" /></Button>
                          </>
                        ) : (
                          <UploadButton label="Enviar" disabled={busy} onFile={(f) => doUpload(f, t.id)} />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {showRequired ? 'Outros arquivos' : 'Arquivos'}
              </p>
              <UploadButton label="Adicionar arquivo" disabled={busy} onFile={(f) => doUpload(f)} />
            </div>
            {freeDocs.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum arquivo.</p>
            ) : (
              <div className="border rounded-lg divide-y">{freeDocs.map(fileRow)}</div>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
