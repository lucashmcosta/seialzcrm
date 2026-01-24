import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, ArrowRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { toast } from 'sonner';

import type { KommoPipeline, StageMapping, KommoCredentials } from '@/hooks/useKommoMigration';

interface KommoPipelineMappingStepProps {
  credentials: KommoCredentials;
  kommoPipelines: KommoPipeline[];
  crmStages: any[];
  stageMapping: StageMapping;
  onMappingChange: (mapping: StageMapping) => void;
  fetchPipelinesMutation: any;
}

export function KommoPipelineMappingStep({
  credentials,
  kommoPipelines,
  crmStages = [],
  stageMapping,
  onMappingChange,
  fetchPipelinesMutation,
}: KommoPipelineMappingStepProps) {
  const { organization } = useOrganization();
  const [newStageName, setNewStageName] = useState('');
  const [creatingStage, setCreatingStage] = useState(false);
  const [localCrmStages, setLocalCrmStages] = useState(crmStages);

  useEffect(() => {
    setLocalCrmStages(crmStages);
  }, [crmStages]);

  useEffect(() => {
    if (credentials && kommoPipelines.length === 0) {
      fetchPipelinesMutation.mutate(credentials);
    }
  }, [credentials]);

  const handleStageSelect = (kommoStageKey: string, crmStageId: string) => {
    onMappingChange({
      ...stageMapping,
      [kommoStageKey]: crmStageId,
    });
  };

  const handleCreateStage = async () => {
    if (!newStageName.trim() || !organization) return;

    setCreatingStage(true);
    try {
      const maxOrder = Math.max(...localCrmStages.map(s => s.order_index || 0), 0);
      
      const { data, error } = await supabase
        .from('pipeline_stages')
        .insert({
          organization_id: organization.id,
          name: newStageName.trim(),
          order_index: maxOrder + 1,
          stage_type: 'custom',
        })
        .select()
        .single();

      if (error) throw error;

      setLocalCrmStages([...localCrmStages, data]);
      setNewStageName('');
      toast.success('Etapa criada com sucesso!');
    } catch (error: any) {
      toast.error(`Erro ao criar etapa: ${error.message}`);
    } finally {
      setCreatingStage(false);
    }
  };

  const getStageTypeLabel = (type: number | undefined) => {
    switch (type) {
      case 1:
        return { label: 'Ganho', color: 'bg-green-500/10 text-green-600' };
      case 2:
        return { label: 'Perdido', color: 'bg-red-500/10 text-red-600' };
      default:
        return null;
    }
  };

  const allMapped = kommoPipelines.every(pipeline =>
    pipeline.stages.every(stage => stageMapping[`${pipeline.id}_${stage.id}`])
  );

  if (fetchPipelinesMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Buscando pipelines do Kommo...</p>
      </div>
    );
  }

  if (fetchPipelinesMutation.isError) {
    return (
      <div className="text-center py-12">
        <p className="text-destructive">Erro ao buscar pipelines: {fetchPipelinesMutation.error?.message}</p>
        <Button onClick={() => fetchPipelinesMutation.mutate(credentials)} className="mt-4">
          Tentar novamente
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Para cada etapa do Kommo, selecione a etapa correspondente no seu CRM. 
        Isso garantirá que as oportunidades sejam importadas na etapa correta.
      </div>

      {/* Create new stage section */}
      <Card className="p-4 bg-muted/50">
        <Label className="text-sm font-medium">Criar nova etapa no CRM</Label>
        <div className="flex gap-2 mt-2">
          <Input
            placeholder="Nome da nova etapa"
            value={newStageName}
            onChange={(e) => setNewStageName(e.target.value)}
            disabled={creatingStage}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={handleCreateStage}
            disabled={!newStageName.trim() || creatingStage}
          >
            {creatingStage ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </Card>

      {/* Pipeline mapping */}
      <div className="space-y-6">
        {kommoPipelines.map((pipeline) => (
          <Card key={pipeline.id} className="p-4">
            <h4 className="font-medium mb-4 flex items-center gap-2">
              Pipeline: {pipeline.name}
              {pipeline.stages.every(s => stageMapping[`${pipeline.id}_${s.id}`]) && (
                <CheckCircle2 className="h-4 w-4 text-primary" />
              )}
            </h4>
            
            <div className="space-y-3">
              {pipeline.stages.map((stage) => {
                const stageKey = `${pipeline.id}_${stage.id}`;
                const typeInfo = getStageTypeLabel(stage.type);
                
                return (
                  <div key={stage.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm truncate">{stage.name}</span>
                        {typeInfo && (
                          <Badge variant="secondary" className={typeInfo.color}>
                            {typeInfo.label}
                          </Badge>
                        )}
                      </div>
                    </div>
                    
                    <ArrowRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    
                    <Select
                      value={stageMapping[stageKey] || ''}
                      onValueChange={(value) => handleStageSelect(stageKey, value)}
                    >
                      <SelectTrigger className="w-48">
                        <SelectValue placeholder="Selecionar etapa" />
                      </SelectTrigger>
                      <SelectContent>
                        {localCrmStages.map((crmStage) => (
                          <SelectItem key={crmStage.id} value={crmStage.id}>
                            {crmStage.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              })}
            </div>
          </Card>
        ))}
      </div>

      {!allMapped && (
        <p className="text-sm text-muted-foreground text-center">
          Mapeie todas as etapas para continuar
        </p>
      )}
    </div>
  );
}
