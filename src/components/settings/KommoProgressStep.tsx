import { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  CheckCircle2, 
  XCircle, 
  Loader2, 
  Users, 
  Briefcase, 
  AlertTriangle,
  RotateCcw,
  FileWarning,
  Clock
} from 'lucide-react';

import type { ImportLog } from '@/hooks/useKommoMigration';

interface KommoProgressStepProps {
  importLog: ImportLog | null;
  onRollback: () => void;
  onClose: () => void;
  rollbackMutation: any;
}

export function KommoProgressStep({
  importLog,
  onRollback,
  onClose,
  rollbackMutation,
}: KommoProgressStepProps) {
  const [showErrorsDialog, setShowErrorsDialog] = useState(false);
  const [showPauseDialog, setShowPauseDialog] = useState(false);

  if (!importLog) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Iniciando migração...</p>
      </div>
    );
  }

  const isRunning = importLog.status === 'running';
  const isPaused = importLog.status === 'paused';
  const isCompleted = importLog.status === 'completed';
  const isFailed = importLog.status === 'failed';
  const isRolledBack = importLog.status === 'rolled_back';

  const canRollback = importLog.rollback_available && 
    !isRolledBack && 
    (isCompleted || isFailed) &&
    !rollbackMutation.isPending;

  // Calculate time since completion for rollback availability
  const getTimeRemaining = () => {
    if (!importLog.completed_at) return null;
    const completedAt = new Date(importLog.completed_at);
    const deadline = new Date(completedAt.getTime() + 24 * 60 * 60 * 1000);
    const now = new Date();
    const remaining = deadline.getTime() - now.getTime();
    if (remaining <= 0) return null;
    const hours = Math.floor(remaining / (1000 * 60 * 60));
    const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${minutes}m`;
  };

  const renderStatusIcon = () => {
    if (isRunning) return <Loader2 className="h-6 w-6 animate-spin text-primary" />;
    if (isPaused) return <AlertTriangle className="h-6 w-6 text-yellow-500" />;
    if (isCompleted) return <CheckCircle2 className="h-6 w-6 text-green-500" />;
    if (isFailed) return <XCircle className="h-6 w-6 text-destructive" />;
    if (isRolledBack) return <RotateCcw className="h-6 w-6 text-muted-foreground" />;
    return <Clock className="h-6 w-6 text-muted-foreground" />;
  };

  const getStatusLabel = () => {
    if (isRunning) return 'Migração em Andamento';
    if (isPaused) return 'Migração Pausada';
    if (isCompleted) return 'Migração Concluída';
    if (isFailed) return 'Migração Falhou';
    if (isRolledBack) return 'Migração Desfeita';
    return 'Aguardando...';
  };

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="flex items-center gap-3 justify-center">
        {renderStatusIcon()}
        <h3 className="text-lg font-medium">{getStatusLabel()}</h3>
      </div>

      {/* Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progresso</span>
          <span className="font-medium">{importLog.progress_percent}%</span>
        </div>
        <Progress value={importLog.progress_percent} className="h-2" />
        {importLog.last_processed_item && isRunning && (
          <p className="text-xs text-muted-foreground truncate">
            Processando: {importLog.last_processed_item}
          </p>
        )}
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4">
        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Contatos</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Importados:</span>
              <span className="text-green-600">{importLog.imported_contacts}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Pulados:</span>
              <span className="text-yellow-600">{importLog.skipped_contacts}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span>{importLog.total_contacts}</span>
            </div>
          </div>
        </Card>

        <Card className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Briefcase className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Oportunidades</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Importadas:</span>
              <span className="text-green-600">{importLog.imported_opportunities}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Puladas:</span>
              <span className="text-yellow-600">{importLog.skipped_opportunities}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total:</span>
              <span>{importLog.total_opportunities}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Errors Alert */}
      {importLog.error_count > 0 && (
        <Alert variant="destructive" className="border-destructive/50">
          <FileWarning className="h-4 w-4" />
          <AlertTitle>Erros durante a migração</AlertTitle>
          <AlertDescription className="flex items-center justify-between">
            <span>{importLog.error_count} registro(s) com erro</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowErrorsDialog(true)}
            >
              Ver Erros
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {/* Paused Alert */}
      {isPaused && (
        <Alert className="border-yellow-500/50 bg-yellow-500/5">
          <AlertTriangle className="h-4 w-4 text-yellow-600" />
          <AlertTitle>Migração pausada</AlertTitle>
          <AlertDescription>
            Mais de 20% dos registros falharam. Revise os erros antes de continuar.
          </AlertDescription>
        </Alert>
      )}

      {/* Rollback Info */}
      {canRollback && (
        <Alert className="border-primary/50 bg-primary/5">
          <RotateCcw className="h-4 w-4" />
          <AlertTitle>Rollback disponível</AlertTitle>
          <AlertDescription>
            Você pode desfazer esta migração{' '}
            {getTimeRemaining() && <span>por mais {getTimeRemaining()}</span>}.
          </AlertDescription>
        </Alert>
      )}

      {isRolledBack && (
        <Alert>
          <RotateCcw className="h-4 w-4" />
          <AlertDescription>
            Esta migração foi desfeita. Todos os registros importados foram removidos.
          </AlertDescription>
        </Alert>
      )}

      {/* Actions */}
      <div className="flex gap-3 justify-end">
        {canRollback && (
          <Button
            variant="outline"
            onClick={onRollback}
            disabled={rollbackMutation.isPending}
          >
            {rollbackMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Desfazendo...
              </>
            ) : (
              <>
                <RotateCcw className="h-4 w-4 mr-2" />
                Desfazer Migração
              </>
            )}
          </Button>
        )}
        
        {(isCompleted || isFailed || isRolledBack) && (
          <Button onClick={onClose}>
            Concluir
          </Button>
        )}
      </div>

      {/* Errors Dialog */}
      <Dialog open={showErrorsDialog} onOpenChange={setShowErrorsDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Erros da Migração</DialogTitle>
            <DialogDescription>
              {importLog.error_count} registro(s) apresentaram erros durante a importação.
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="max-h-96">
            <div className="space-y-2">
              {importLog.errors?.map((error: any, idx: number) => (
                <Card key={idx} className="p-3">
                  <div className="flex items-start gap-2">
                    <Badge variant={error.type === 'contact' ? 'secondary' : 'outline'}>
                      {error.type === 'contact' ? 'Contato' : 'Lead'}
                    </Badge>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">
                        {error.name || `ID: ${error.kommo_id}`}
                      </p>
                      <p className="text-xs text-destructive">{error.error}</p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </ScrollArea>
          <DialogFooter>
            <Button onClick={() => setShowErrorsDialog(false)}>Fechar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
