import { useRef, useState } from 'react';
import { useContactDocuments, type ChecklistRow, type DocSubmissionStatus } from '@/hooks/documents/useContactDocuments';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import {
  SpinnerGap,
  UploadSimple,
  DownloadSimple,
  TrashSimple,
  Check,
  X,
  ArrowsClockwise,
  File as FileIcon,
} from '@phosphor-icons/react';

interface Props {
  contactId: string;
}

const statusMeta: Record<DocSubmissionStatus, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  pending: { label: 'Pendente', variant: 'outline' },
  uploaded: { label: 'Enviado', variant: 'secondary' },
  approved: { label: 'Aprovado', variant: 'default' },
  rejected: { label: 'Rejeitado', variant: 'destructive' },
};

export function DocumentChecklist({ contactId }: Props) {
  const { rows, loading, canReview, uploadForType, approve, reject, remove, downloadAttachment } =
    useContactDocuments(contactId);
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [rejectingRow, setRejectingRow] = useState<ChecklistRow | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [removingRow, setRemovingRow] = useState<ChecklistRow | null>(null);
  const fileInputs = useRef<Record<string, HTMLInputElement | null>>({});

  const triggerUpload = (typeId: string) => {
    fileInputs.current[typeId]?.click();
  };

  const handleFile = async (row: ChecklistRow, file: File | undefined) => {
    if (!file) return;
    setBusy(row.type.id);
    try {
      await uploadForType(row.type.id, file, row.submission?.id);
      toast({ description: 'Documento enviado' });
    } catch (e: any) {
      console.error(e);
      toast({ variant: 'destructive', description: e.message || 'Erro ao enviar' });
    } finally {
      setBusy(null);
    }
  };

  const handleApprove = async (row: ChecklistRow) => {
    if (!row.submission) return;
    setBusy(row.type.id);
    try {
      await approve(row.submission.id);
      toast({ description: 'Documento aprovado' });
    } catch (e: any) {
      toast({ variant: 'destructive', description: e.message || 'Erro' });
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmReject = async () => {
    if (!rejectingRow?.submission || !rejectReason.trim()) return;
    setBusy(rejectingRow.type.id);
    try {
      await reject(rejectingRow.submission.id, rejectReason.trim());
      toast({ description: 'Documento rejeitado' });
      setRejectingRow(null);
      setRejectReason('');
    } catch (e: any) {
      toast({ variant: 'destructive', description: e.message || 'Erro' });
    } finally {
      setBusy(null);
    }
  };

  const handleConfirmRemove = async () => {
    if (!removingRow?.submission) return;
    setBusy(removingRow.type.id);
    try {
      await remove(removingRow.submission);
      toast({ description: 'Documento excluído' });
      setRemovingRow(null);
    } catch (e: any) {
      toast({ variant: 'destructive', description: e.message || 'Erro' });
    } finally {
      setBusy(null);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <SpinnerGap className="h-6 w-6 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="py-10 text-center text-muted-foreground text-sm">
          Nenhum tipo de documento configurado. Configure em Configurações &rarr; Documentos.
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Checklist de Documentos</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.map((row) => {
            const meta = statusMeta[row.status];
            const rowBusy = busy === row.type.id;
            return (
              <div
                key={row.type.id}
                className="flex flex-wrap items-center gap-3 p-3 rounded-md border bg-card"
              >
                <div className="flex items-center gap-2 flex-1 min-w-0">
                  <FileIcon className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm truncate">{row.type.name}</span>
                      {row.type.is_required && (
                        <Badge variant="outline" className="text-[10px]">Obrigatório</Badge>
                      )}
                      <Badge variant={meta.variant} className="text-[10px]">{meta.label}</Badge>
                    </div>
                    {row.attachment && (
                      <div className="text-xs text-muted-foreground truncate">
                        {row.attachment.file_name}
                      </div>
                    )}
                    {row.status === 'rejected' && row.submission?.rejection_reason && (
                      <div className="text-xs text-destructive mt-0.5">
                        Motivo: {row.submission.rejection_reason}
                      </div>
                    )}
                  </div>
                </div>

                <input
                  ref={(el) => (fileInputs.current[row.type.id] = el)}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    handleFile(row, f);
                    e.target.value = '';
                  }}
                />

                <div className="flex items-center gap-1 flex-wrap">
                  {row.attachment && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Baixar"
                      onClick={() => downloadAttachment(row.attachment!)}
                    >
                      <DownloadSimple className="w-4 h-4" />
                    </Button>
                  )}

                  {row.status === 'pending' && (
                    <Button size="sm" disabled={rowBusy} onClick={() => triggerUpload(row.type.id)}>
                      {rowBusy ? (
                        <SpinnerGap className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <UploadSimple className="w-4 h-4 mr-1" /> Enviar
                        </>
                      )}
                    </Button>
                  )}

                  {(row.status === 'uploaded' || row.status === 'approved' || row.status === 'rejected') && (
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={rowBusy}
                      onClick={() => triggerUpload(row.type.id)}
                      title="Substituir"
                    >
                      <ArrowsClockwise className="w-4 h-4 mr-1" /> Substituir
                    </Button>
                  )}

                  {canReview && row.status === 'uploaded' && (
                    <>
                      <Button size="sm" disabled={rowBusy} onClick={() => handleApprove(row)}>
                        <Check className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rowBusy}
                        onClick={() => {
                          setRejectingRow(row);
                          setRejectReason('');
                        }}
                      >
                        <X className="w-4 h-4 mr-1" /> Rejeitar
                      </Button>
                    </>
                  )}

                  {canReview && row.submission && (
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Excluir"
                      disabled={rowBusy}
                      onClick={() => setRemovingRow(row)}
                    >
                      <TrashSimple className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Dialog open={!!rejectingRow} onOpenChange={(o) => !o && setRejectingRow(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rejeitar documento</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reason">Motivo da rejeição</Label>
            <Textarea
              id="reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Descreva o motivo..."
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectingRow(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!rejectReason.trim()}
              onClick={handleConfirmReject}
            >
              Rejeitar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!removingRow}
        onOpenChange={(o) => !o && setRemovingRow(null)}
        title="Excluir documento"
        description={`Excluir o documento enviado para "${removingRow?.type.name}"?`}
        confirmText="Excluir"
        variant="destructive"
        onConfirm={handleConfirmRemove}
      />
    </>
  );
}
