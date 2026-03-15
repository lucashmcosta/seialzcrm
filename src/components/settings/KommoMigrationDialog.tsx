import { useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CaretLeft, CaretRight, UploadSimple, WarningCircle, SpinnerGap, PlayCircle, XCircle } from '@phosphor-icons/react';

import { useKommoMigration } from '@/hooks/useKommoMigration';
import { KommoCredentialsStep } from './KommoCredentialsStep';
import { KommoPipelineMappingStep } from './KommoPipelineMappingStep';
import { KommoPreviewStep } from './KommoPreviewStep';
import { KommoProgressStep } from './KommoProgressStep';
import { KommoUserMappingStep } from './KommoUserMappingStep';

interface KommoMigrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KommoMigrationDialog({ open, onOpenChange }: KommoMigrationDialogProps) {
  const {
    organization,
    step,
    credentials,
    kommoPipelines,
    stageMapping,
    selectedPipelineIds,
    userMappings,
    config,
    importLog,
    crmStages,
    crmUsers,
    refetchCrmUsers,
    savedCredentials,
    pendingImport,
    isResuming,
    setCredentials,
    setStageMapping,
    setSelectedPipelineIds,
    setUserMappings,
    setConfig,
    goToStep,
    reset,
    resumeMigration,
    cancelPendingMigration,
    validateMutation,
    fetchPipelinesMutation,
    previewMutation,
    startMigrationMutation,
    rollbackMutation,
  } = useKommoMigration();

  useEffect(() => {
    if (!open) {
      if (!importLog || ['completed', 'failed', 'rolled_back', 'cancelled'].includes(importLog.status)) {
        reset();
      }
    }
  }, [open]);

  const handleClose = () => {
    onOpenChange(false);
    reset();
  };

  const handleCredentialsValidated = (creds: any) => {
    setCredentials(creds);
  };

  const handleStartMigration = async () => {
    goToStep(5);
    startMigrationMutation.mutate();
  };

  const handleRollback = () => {
    if (importLog?.id) {
      rollbackMutation.mutate(importLog.id);
    }
  };

  const handleResumeMigration = () => {
    resumeMigration();
  };

  const handleCancelPendingMigration = async () => {
    await cancelPendingMigration();
  };

  const canProceedFromStep1 = credentials !== null;
  const canProceedFromStep2 = selectedPipelineIds.length > 0 && 
    kommoPipelines
      .filter(p => selectedPipelineIds.includes(p.id))
      .every(p => p.stages.every(s => stageMapping[`${p.id}_${s.id}`]));
  const canProceedFromStep3 = true; // User mapping is optional
  const canProceedFromStep4 = previewMutation.data !== undefined;

  const steps = [
    { number: 1, title: 'Credenciais' },
    { number: 2, title: 'Pipeline' },
    { number: 3, title: 'Usuários' },
    { number: 4, title: 'Preview' },
    { number: 5, title: 'Migração' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UploadSimple className="h-5 w-5" />
            Migrar dados do Kommo
          </DialogTitle>
          <DialogDescription>
            Importe seus contatos, oportunidades, empresas, tarefas e notas do Kommo.
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-2 py-2">
          {steps.map((s, idx) => (
            <div key={s.number} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-medium transition-colors
                    ${step === s.number 
                      ? 'bg-primary text-primary-foreground' 
                      : step > s.number 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-muted text-muted-foreground'
                    }`}
                >
                  {s.number}
                </div>
                <span className="text-[10px] mt-1 text-muted-foreground">{s.title}</span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`w-8 sm:w-12 h-0.5 mx-1 mt-[-16px] ${step > s.number ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        <Separator />

        {/* Pending Migration Alert */}
        {pendingImport && step < 5 && (
          <Alert className="mx-1 border-warning/50 bg-warning/5">
            <WarningCircle className="h-4 w-4 text-warning" />
            <AlertTitle>Migração em andamento</AlertTitle>
            <AlertDescription className="flex flex-col gap-3">
              <span>
                Há uma migração pausada ({pendingImport.progress_percent}% concluído, {pendingImport.imported_contacts} contatos importados).
              </span>
              <div className="flex gap-2">
                <Button 
                  size="sm" 
                  onClick={handleResumeMigration}
                  disabled={isResuming}
                >
                  {isResuming ? (
                    <>
                      <SpinnerGap className="h-4 w-4 mr-1 animate-spin" />
                      Retomando...
                    </>
                  ) : (
                    <>
                      <PlayCircle className="h-4 w-4 mr-1" />
                      Continuar
                    </>
                  )}
                </Button>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={handleCancelPendingMigration}
                  disabled={isResuming}
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancelar
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        )}

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto py-4 px-1">
          {step === 1 && (
            <KommoCredentialsStep
              onValidated={handleCredentialsValidated}
              validateMutation={validateMutation}
              savedCredentials={savedCredentials}
            />
          )}

          {step === 2 && credentials && (
            <KommoPipelineMappingStep
              credentials={credentials}
              kommoPipelines={kommoPipelines}
              crmStages={crmStages || []}
              stageMapping={stageMapping}
              onMappingChange={setStageMapping}
              selectedPipelineIds={selectedPipelineIds}
              onSelectedPipelinesChange={setSelectedPipelineIds}
              fetchPipelinesMutation={fetchPipelinesMutation}
            />
          )}

          {step === 3 && (
            <KommoUserMappingStep
              userMappings={userMappings}
              crmUsers={crmUsers || []}
              onMappingsChange={setUserMappings}
              organizationId={organization?.id}
              onCrmUsersRefresh={() => refetchCrmUsers()}
            />
          )}

          {step === 4 && credentials && (
            <KommoPreviewStep
              credentials={credentials}
              config={config}
              onConfigChange={setConfig}
              previewMutation={previewMutation}
              selectedPipelineNames={kommoPipelines
                .filter(p => selectedPipelineIds.includes(p.id))
                .map(p => p.name)}
            />
          )}

          {step === 5 && (
            <KommoProgressStep
              importLog={importLog}
              onRollback={handleRollback}
              onClose={handleClose}
              rollbackMutation={rollbackMutation}
            />
          )}
        </div>

        <Separator />

        {/* Navigation Footer */}
        {step < 5 && (
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => goToStep(step - 1)}
              disabled={step === 1}
            >
              <CaretLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>

            {step === 4 ? (
              <Button
                onClick={handleStartMigration}
                disabled={!canProceedFromStep4 || startMigrationMutation.isPending}
              >
                Iniciar Migração
                 <CaretRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => goToStep(step + 1)}
                disabled={
                  (step === 1 && !canProceedFromStep1) ||
                  (step === 2 && !canProceedFromStep2) ||
                  (step === 3 && !canProceedFromStep3)
                }
              >
                Próximo
                <CaretRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
