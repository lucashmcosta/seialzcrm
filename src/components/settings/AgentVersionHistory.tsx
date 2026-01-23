import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/dialog';
import { 
  Loader2, History, RotateCcw, Eye, Check, 
  AlertCircle, ChevronDown, ChevronUp 
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface AgentVersion {
  id: string;
  agent_id: string;
  version_number: number;
  kernel_prompt: string | null;
  wizard_data: any;
  ai_provider: string | null;
  ai_model: string | null;
  enabled_tools: any;
  feedback_rules: any;
  tool_triggers: any;
  compliance_rules: any;
  created_at: string;
  created_by: string | null;
  change_note: string | null;
  is_rollback: boolean;
  rollback_from_version: number | null;
}

interface AgentVersionHistoryProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agentId: string;
  currentVersion: number;
  onRestore: (version: AgentVersion) => Promise<void>;
}

export function AgentVersionHistory({
  open,
  onOpenChange,
  agentId,
  currentVersion,
  onRestore,
}: AgentVersionHistoryProps) {
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRestoring, setIsRestoring] = useState(false);
  const [expandedVersion, setExpandedVersion] = useState<string | null>(null);

  useEffect(() => {
    if (open && agentId) {
      fetchVersions();
    }
  }, [open, agentId]);

  const fetchVersions = async () => {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from('ai_agent_versions')
        .select('*')
        .eq('agent_id', agentId)
        .order('version_number', { ascending: false });

      if (error) throw error;
      setVersions(data || []);
    } catch (error: any) {
      console.error('Error fetching versions:', error);
      toast.error('Erro ao carregar histórico de versões');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRestore = async (version: AgentVersion) => {
    if (version.version_number === currentVersion) {
      toast.info('Esta já é a versão atual');
      return;
    }

    setIsRestoring(true);
    try {
      await onRestore(version);
      toast.success(`Restaurado para versão ${version.version_number}`);
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error restoring version:', error);
      toast.error(error.message || 'Erro ao restaurar versão');
    } finally {
      setIsRestoring(false);
    }
  };

  const toggleExpand = (versionId: string) => {
    setExpandedVersion(prev => prev === versionId ? null : versionId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <History className="h-5 w-5" />
            Histórico de Versões
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : versions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <AlertCircle className="h-8 w-8 mb-2" />
            <p>Nenhuma versão encontrada</p>
            <p className="text-sm">As versões são criadas automaticamente ao salvar o agente.</p>
          </div>
        ) : (
          <ScrollArea className="max-h-[60vh]">
            <div className="space-y-3 pr-4">
              {versions.map((version) => {
                const isCurrent = version.version_number === currentVersion;
                const isExpanded = expandedVersion === version.id;

                return (
                  <div
                    key={version.id}
                    className={cn(
                      'border rounded-lg p-4 transition-colors',
                      isCurrent ? 'border-primary bg-primary/5' : 'border-border'
                    )}
                  >
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium">v{version.version_number}</span>
                          {isCurrent && (
                            <Badge variant="default" className="text-xs">
                              <Check className="h-3 w-3 mr-1" />
                              Atual
                            </Badge>
                          )}
                          {version.is_rollback && (
                            <Badge variant="outline" className="text-xs">
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Rollback de v{version.rollback_from_version}
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {format(new Date(version.created_at), "dd 'de' MMM 'de' yyyy 'às' HH:mm", { locale: ptBR })}
                        </p>
                        {version.change_note && (
                          <p className="text-sm italic">"{version.change_note}"</p>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => toggleExpand(version.id)}
                        >
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                        {!isCurrent && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleRestore(version)}
                            disabled={isRestoring}
                          >
                            {isRestoring ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <>
                                <RotateCcw className="h-4 w-4 mr-1" />
                                Restaurar
                              </>
                            )}
                          </Button>
                        )}
                      </div>
                    </div>

                    {/* Expanded details */}
                    {isExpanded && (
                      <div className="mt-4 pt-4 border-t space-y-3">
                        {version.ai_provider && (
                          <div className="text-sm">
                            <span className="font-medium">Modelo: </span>
                            <span className="text-muted-foreground">
                              {version.ai_provider} / {version.ai_model || 'auto'}
                            </span>
                          </div>
                        )}
                        
                        {version.enabled_tools && (
                          <div className="text-sm">
                            <span className="font-medium">Ferramentas: </span>
                            <span className="text-muted-foreground">
                              {version.enabled_tools.length} habilitadas
                            </span>
                          </div>
                        )}

                        {version.feedback_rules && (
                          <div className="text-sm">
                            <span className="font-medium">Regras de feedback: </span>
                            <span className="text-muted-foreground">
                              {version.feedback_rules.length} regras
                            </span>
                          </div>
                        )}

                        {version.kernel_prompt && (
                          <div className="text-sm">
                            <span className="font-medium">Prompt: </span>
                            <p className="text-muted-foreground text-xs mt-1 p-2 bg-muted rounded max-h-32 overflow-y-auto">
                              {version.kernel_prompt.slice(0, 500)}...
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
