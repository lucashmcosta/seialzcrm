import { useEffect } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { ChevronLeft, ChevronRight, Upload } from 'lucide-react';

import { useKommoMigration } from '@/hooks/useKommoMigration';
import { KommoCredentialsStep } from './KommoCredentialsStep';
import { KommoPipelineMappingStep } from './KommoPipelineMappingStep';
import { KommoPreviewStep } from './KommoPreviewStep';
import { KommoProgressStep } from './KommoProgressStep';

interface KommoMigrationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KommoMigrationDialog({ open, onOpenChange }: KommoMigrationDialogProps) {
  const {
    step,
    credentials,
    kommoPipelines,
    stageMapping,
    config,
    importLog,
    crmStages,
    savedCredentials,
    setCredentials,
    setStageMapping,
    setConfig,
    goToStep,
    reset,
    validateMutation,
    fetchPipelinesMutation,
    previewMutation,
    startMigrationMutation,
    rollbackMutation,
  } = useKommoMigration();

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      // Only reset if migration is not in progress
      if (!importLog || ['completed', 'failed', 'rolled_back'].includes(importLog.status)) {
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
    goToStep(4);
    startMigrationMutation.mutate();
  };

  const handleRollback = () => {
    if (importLog?.id) {
      rollbackMutation.mutate(importLog.id);
    }
  };

  // Check if can proceed to next step
  const canProceedFromStep1 = credentials !== null;
  const canProceedFromStep2 = kommoPipelines.length > 0 && 
    kommoPipelines.every(p => p.stages.every(s => stageMapping[`${p.id}_${s.id}`]));
  const canProceedFromStep3 = previewMutation.data !== undefined;

  const steps = [
    { number: 1, title: 'Credenciais' },
    { number: 2, title: 'Mapeamento' },
    { number: 3, title: 'Preview' },
    { number: 4, title: 'Migração' },
  ];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Migrar dados do Kommo
          </DialogTitle>
          <DialogDescription>
            Importe seus contatos e oportunidades do Kommo para o CRM.
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-between px-4 py-2">
          {steps.map((s, idx) => (
            <div key={s.number} className="flex items-center">
              <div className="flex flex-col items-center">
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors
                    ${step === s.number 
                      ? 'bg-primary text-primary-foreground' 
                      : step > s.number 
                        ? 'bg-primary/20 text-primary' 
                        : 'bg-muted text-muted-foreground'
                    }`}
                >
                  {s.number}
                </div>
                <span className="text-xs mt-1 text-muted-foreground">{s.title}</span>
              </div>
              {idx < steps.length - 1 && (
                <div className={`w-12 h-0.5 mx-2 mt-[-16px] ${step > s.number ? 'bg-primary' : 'bg-muted'}`} />
              )}
            </div>
          ))}
        </div>

        <Separator />

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
              fetchPipelinesMutation={fetchPipelinesMutation}
            />
          )}

          {step === 3 && credentials && (
            <KommoPreviewStep
              credentials={credentials}
              config={config}
              onConfigChange={setConfig}
              previewMutation={previewMutation}
            />
          )}

          {step === 4 && (
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
        {step < 4 && (
          <div className="flex justify-between pt-4">
            <Button
              variant="outline"
              onClick={() => goToStep(step - 1)}
              disabled={step === 1}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              Voltar
            </Button>

            {step === 3 ? (
              <Button
                onClick={handleStartMigration}
                disabled={!canProceedFromStep3 || startMigrationMutation.isPending}
              >
                Iniciar Migração
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            ) : (
              <Button
                onClick={() => goToStep(step + 1)}
                disabled={
                  (step === 1 && !canProceedFromStep1) ||
                  (step === 2 && !canProceedFromStep2)
                }
              >
                Próximo
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
