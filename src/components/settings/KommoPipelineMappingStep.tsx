import { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { SpinnerGap, Plus, ArrowRight, CheckCircle } from '@phosphor-icons/react';
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
  selectedPipelineIds: number[];
  onSelectedPipelinesChange: (ids: number[]) => void;
  fetchPipelinesMutation: any;
}

const CREATE_PREFIX = '__create__';

export function KommoPipelineMappingStep({
  credentials,
  kommoPipelines,
  crmStages = [],
  stageMapping,
  onMappingChange,
  selectedPipelineIds,
  onSelectedPipelinesChange,
  fetchPipelinesMutation,
}: KommoPipelineMappingStepProps) {
  const { organization } = useOrganization();
  const [newStageName, setNewStageName] = useState('');
  const [creatingStage, setCreatingStage] = useState(false);
  const [creatingStagForKey, setCreatingStageForKey] = useState<string | null>(null);
  const [localCrmStages, setLocalCrmStages] = useState(crmStages);

  useEffect(() => {
    setLocalCrmStages(crmStages);
  }, [crmStages]);

  useEffect(() => {
    if (credentials && kommoPipelines.length === 0) {
      fetchPipelinesMutation.mutate(credentials);
    }
  }, [credentials]);

  const handleStageSelect = async (kommoStageKey: string, value: string, kommoStageName: string) => {
    // "Create new" option selected
    if (value.startsWith(CREATE_PREFIX)) {
      const stageName = value.replace(CREATE_PREFIX, '');
      await createAndMapStage(kommoStageKey, stageName);
      return;
    }

    onMappingChange({
      ...stageMapping,
      [kommoStageKey]: value,
    });
  };

  const createAndMapStage = async (kommoStageKey: string, stageName: string) => {
    if (!organization) return;

    setCreatingStageForKey(kommoStageKey);
    try {
      const maxOrder = Math.max(...localCrmStages.map(s => s.order_index || 0), 0);

      const { data, error } = await supabase
        .from('pipeline_stages')
        .insert({
          organization_id: organization.id,
          name: stageName.trim(),
          order_index: maxOrder + 1,
        } as any)
        .select()
        .single();

      if (error) throw error;

      setLocalCrmStages(prev => [...prev, data]);
      onMappingChange({
        ...stageMapping,
        [kommoStageKey]: data.id,
      });
      toast.success(`Stage "${stageName}" criado`);
    } catch (error: any) {
      toast.error(`Erro ao criar stage: ${error.message}`);
    } finally {
      setCreatingStageForKey(null);
    }
  };

  const handlePipelineToggle = (pipelineId: number, checked: boolean) => {
    if (checked) {
      onSelectedPipelinesChange([...selectedPipelineIds, pipelineId]);
    } else {
      onSelectedPipelinesChange(selectedPipelineIds.filter(id => id !== pipelineId));
    }
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

  const isPipelineSelected = (pipelineId: number) => selectedPipelineIds.includes(pipelineId);

  const isPipelineFullyMapped = (pipeline: KommoPipeline) =>
    pipeline.stages.every(s => stageMapping[`${pipeline.id}_${s.id}`]);

  if (fetchPipelinesMutation.isPending) {
    return (
      <div className="flex flex-col items-center justify-center py-12 space-y-4">
        <SpinnerGap className="h-8 w-8 animate-spin text-primary" />
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

  const selectedCount = selectedPipelineIds.length;
  const allSelectedMapped = kommoPipelines
    .filter(p => isPipelineSelected(p.id))
    .every(p => isPipelineFullyMapped(p));

  return (
    <div className="space-y-6">
      <div className="text-sm text-muted-foreground">
        Selecione quais pipelines importar e mapeie suas etapas para o CRM.
        Use a opção "➕ Criar" no dropdown para criar stages automaticamente.
      </div>

      {/* Create new stage section */}
      <Card className="p-4 bg-muted/50">
        <Label className="text-sm font-medium">Criar nova etapa manualmente</Label>
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
              <SpinnerGap className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
          </Button>
        </div>
      </Card>

      {/* Pipeline mapping */}
      <div className="space-y-6">
        {kommoPipelines.map((pipeline) => {
          const selected = isPipelineSelected(pipeline.id);
          const fullyMapped = isPipelineFullyMapped(pipeline);

          return (
            <Card key={pipeline.id} className={`p-4 transition-opacity ${!selected ? 'opacity-50' : ''}`}>
              <div className="flex items-center gap-3 mb-4">
                <Checkbox
                  checked={selected}
                  onCheckedChange={(checked) => handlePipelineToggle(pipeline.id, !!checked)}
                />
                <h4 className="font-medium flex items-center gap-2 flex-1">
                  {pipeline.name}
                  <Badge variant="secondary" className="text-xs">
                    {pipeline.stages.length} etapas
                  </Badge>
                  {selected && fullyMapped && (
                    <CheckCircle className="h-4 w-4 text-primary" />
                  )}
                </h4>
              </div>

              {selected && (
                <div className="space-y-3 pl-7">
                  {pipeline.stages.map((stage) => {
                    const stageKey = `${pipeline.id}_${stage.id}`;
                    const typeInfo = getStageTypeLabel(stage.type);
                    const isCreatingThis = creatingStagForKey === stageKey;

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

                        {isCreatingThis ? (
                          <div className="w-48 flex items-center justify-center">
                            <SpinnerGap className="h-4 w-4 animate-spin text-primary" />
                            <span className="text-xs text-muted-foreground ml-2">Criando...</span>
                          </div>
                        ) : (
                          <Select
                            value={stageMapping[stageKey] || ''}
                            onValueChange={(value) => handleStageSelect(stageKey, value, stage.name)}
                          >
                            <SelectTrigger className="w-48">
                              <SelectValue placeholder="Selecionar etapa" />
                            </SelectTrigger>
                            <SelectContent>
                              {/* Create new option */}
                              <SelectItem value={`${CREATE_PREFIX}${stage.name}`}>
                                ➕ Criar "{stage.name}"
                              </SelectItem>
                              <Separator className="my-1" />
                              {localCrmStages.map((crmStage) => (
                                <SelectItem key={crmStage.id} value={crmStage.id}>
                                  {crmStage.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>
          );
        })}
      </div>

      {selectedCount === 0 && (
        <p className="text-sm text-destructive text-center">
          Selecione pelo menos 1 pipeline para continuar
        </p>
      )}

      {selectedCount > 0 && !allSelectedMapped && (
        <p className="text-sm text-warning text-center">
          Mapeie todos os stages dos pipelines selecionados ou crie novos stages
        </p>
      )}
    </div>
  );
}
