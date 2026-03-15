import { useState } from 'react';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { 
  CheckCircle, XCircle, SpinnerGap, Users, Briefcase, Warning,
  ArrowCounterClockwise, Clock, Buildings, ListChecks, Note, CalendarBlank, Sliders,
  Warning as FileWarningIcon, Image as ImageIcon
} from '@phosphor-icons/react';

import type { ImportLog, MigrationPhase } from '@/hooks/useKommoMigration';
import { PHASE_ORDER, PHASE_LABELS } from '@/hooks/useKommoMigration';

interface KommoProgressStepProps {
  importLog: ImportLog | null;
  onRollback: () => void;
  onClose: () => void;
  rollbackMutation: any;
}

const PHASE_ICONS: Record<MigrationPhase, any> = {
  users: Users,
  pipelines: Sliders,
  custom_fields: Sliders,
  companies: Buildings,
  contacts: Users,
  leads: Briefcase,
  tasks: ListChecks,
  notes_contacts: Note,
  notes_leads: Note,
  events: CalendarBlank,
};

export function KommoProgressStep({
  importLog,
  onRollback,
  onClose,
  rollbackMutation,
}: KommoProgressStepProps) {
  const [showErrorsDialog, setShowErrorsDialog] = useState(false);

  if (!importLog) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <SpinnerGap className="h-8 w-8 animate-spin text-primary" />
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

  // Parse cursor_state if it comes as string
  const cursorState = typeof importLog.cursor_state === 'string' 
    ? JSON.parse(importLog.cursor_state) 
    : importLog.cursor_state;
  const currentPhase: MigrationPhase | 'done' | null = cursorState?.phase || null;

  const getPhaseStatus = (phase: MigrationPhase): 'done' | 'active' | 'pending' => {
    if (!currentPhase) return 'pending';
    if (isCompleted || currentPhase === 'done') return 'done';
    const currentIdx = PHASE_ORDER.indexOf(currentPhase as MigrationPhase);
    const phaseIdx = PHASE_ORDER.indexOf(phase);
    // If currentPhase is not in PHASE_ORDER (e.g. 'done'), all are done
    if (currentIdx === -1) return 'done';
    if (phaseIdx < currentIdx) return 'done';
    if (phaseIdx === currentIdx) return 'active';
    return 'pending';
  };

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
    if (isRunning) return <SpinnerGap className="h-6 w-6 animate-spin text-primary" />;
    if (isPaused) return <Warning className="h-6 w-6 text-yellow-500" />;
    if (isCompleted) return <CheckCircle className="h-6 w-6 text-green-500" />;
    if (isFailed) return <XCircle className="h-6 w-6 text-destructive" />;
    if (isRolledBack) return <ArrowCounterClockwise className="h-6 w-6 text-muted-foreground" />;
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

  // Check if media download is pending
  const hasMediaPending = importLog.cursor_state?.media_pending === true;

  // Stats for the counters grid
  const statsItems = [
    { label: 'Contatos', imported: importLog.imported_contacts, total: importLog.total_contacts, icon: Users },
    { label: 'Oportunidades', imported: importLog.imported_opportunities, total: importLog.total_opportunities, icon: Briefcase },
    { label: 'Empresas', imported: importLog.imported_companies || 0, total: importLog.total_companies || 0, icon: Buildings },
    { label: 'Tarefas', imported: importLog.imported_tasks || 0, total: importLog.total_tasks || 0, icon: ListChecks },
    { label: 'Notas', imported: importLog.imported_notes || 0, total: importLog.total_notes || 0, icon: Note },
    { label: 'Eventos', imported: importLog.imported_events || 0, total: importLog.total_events || 0, icon: CalendarBlank },
  ].filter(s => s.total > 0);

  return (
    <div className="space-y-6">
      {/* Status Header */}
      <div className="flex items-center gap-3 justify-center">
        {renderStatusIcon()}
        <h3 className="text-lg font-medium">{getStatusLabel()}</h3>
      </div>

      {/* Overall Progress Bar */}
      <div className="space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Progresso geral</span>
          <span className="font-medium">{importLog.progress_percent}%</span>
        </div>
        <Progress value={importLog.progress_percent} className="h-2" />
        {importLog.last_processed_item && isRunning && (
          <p className="text-xs text-muted-foreground truncate">
            Processando: {importLog.last_processed_item}
          </p>
        )}
      </div>

      {/* Phase Progress Bars */}
      <Card className="p-4 space-y-3">
        <h4 className="text-sm font-medium mb-2">Fases da migração</h4>
        {PHASE_ORDER.map((phase) => {
          const status = getPhaseStatus(phase);
          const Icon = PHASE_ICONS[phase];
          return (
            <div key={phase} className="flex items-center gap-3">
              <div className={`p-1 rounded ${
                status === 'done' ? 'text-green-600' : 
                status === 'active' ? 'text-primary' : 
                'text-muted-foreground/40'
              }`}>
                {status === 'active' ? (
                  <SpinnerGap className="h-4 w-4 animate-spin" />
                ) : status === 'done' ? (
                  <CheckCircle className="h-4 w-4" />
                ) : (
                  <Icon className="h-4 w-4" />
                )}
              </div>
              <span className={`text-sm flex-1 ${
                status === 'pending' ? 'text-muted-foreground/50' : 'text-foreground'
              }`}>
                {PHASE_LABELS[phase]}
              </span>
              <Badge 
                variant={status === 'done' ? 'default' : status === 'active' ? 'secondary' : 'outline'}
                className={`text-xs ${
                  status === 'done' ? 'bg-green-600' : ''
                }`}
              >
                {status === 'done' ? 'Concluído' : status === 'active' ? 'Em andamento' : 'Pendente'}
              </Badge>
            </div>
          );
        })}
      </Card>

      {/* Media indicator */}
      {hasMediaPending && (
        <Alert className="border-primary/30 bg-primary/5">
          <ImageIcon className="h-4 w-4 text-primary" />
          <AlertDescription className="text-muted-foreground">
            Download de mídias em andamento em segundo plano. Isso pode levar alguns minutos adicionais.
          </AlertDescription>
        </Alert>
      )}

      {/* Stats Grid */}
      {statsItems.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {statsItems.map(({ label, imported, total, icon: SIcon }) => (
            <Card key={label} className="p-3">
              <div className="flex items-center gap-2 mb-1">
                <SIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="text-xs font-medium">{label}</span>
              </div>
              <p className="text-sm">
                <span className="text-green-600 font-medium">{imported}</span>
                <span className="text-muted-foreground"> / {total}</span>
              </p>
            </Card>
          ))}
        </div>
      )}

      {/* Errors Alert */}
      {importLog.error_count > 0 && (
        <Alert variant="destructive" className="border-destructive/50">
          <FileWarningIcon className="h-4 w-4" />
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
          <Warning className="h-4 w-4 text-yellow-600" />
          <AlertTitle>Migração pausada</AlertTitle>
          <AlertDescription>
            Mais de 20% dos registros falharam. Revise os erros antes de continuar.
          </AlertDescription>
        </Alert>
      )}

      {/* Rollback Info */}
      {canRollback && (
        <Alert className="border-primary/50 bg-primary/5">
           <ArrowCounterClockwise className="h-4 w-4" />
          <AlertTitle>Rollback disponível</AlertTitle>
          <AlertDescription>
            Você pode desfazer esta migração{' '}
            {getTimeRemaining() && <span>por mais {getTimeRemaining()}</span>}.
          </AlertDescription>
        </Alert>
      )}

      {isRolledBack && (
        <Alert>
          <ArrowCounterClockwise className="h-4 w-4" />
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
                <SpinnerGap className="h-4 w-4 mr-2 animate-spin" />
                Desfazendo...
              </>
            ) : (
              <>
                <ArrowCounterClockwise className="h-4 w-4 mr-2" />
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
                      {error.type === 'contact' ? 'Contato' : error.type === 'company' ? 'Empresa' : 'Lead'}
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
