import { Bot, Settings, Zap, Copy, MoreVertical } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface SDRAgentCardProps {
  agent: {
    id: string;
    name: string;
    is_enabled: boolean;
    custom_instructions: string | null;
    ai_provider?: string | null;
    ai_model?: string | null;
  } | null;
  isLoading: boolean;
  onConfigure: () => void;
  onToggle: (enabled: boolean) => void;
  onDuplicate?: () => void;
}

const PROVIDER_LABELS: Record<string, string> = {
  'auto': 'Auto',
  'lovable-ai': 'Lovable AI',
  'claude-ai': 'Claude',
  'openai-gpt': 'GPT',
};

const MODEL_SHORT_LABELS: Record<string, string> = {
  'google/gemini-3-flash-preview': 'Gemini 3 Flash',
  'google/gemini-2.5-flash': 'Gemini 2.5 Flash',
  'google/gemini-2.5-pro': 'Gemini 2.5 Pro',
  'claude-sonnet-4-20250514': 'Sonnet 4',
  'claude-3-5-sonnet-20241022': 'Sonnet 3.5',
  'claude-3-5-haiku-20241022': 'Haiku 3.5',
  'gpt-4o': 'GPT-4o',
  'gpt-4o-mini': 'GPT-4o Mini',
};

function getModelLabel(provider?: string | null, model?: string | null): string | null {
  if (!provider || provider === 'auto') return null;
  
  const providerLabel = PROVIDER_LABELS[provider] || provider;
  const modelLabel = model ? (MODEL_SHORT_LABELS[model] || model) : null;
  
  return modelLabel ? `${providerLabel} (${modelLabel})` : providerLabel;
}

export function SDRAgentCard({ agent, isLoading, onConfigure, onToggle, onDuplicate }: SDRAgentCardProps) {
  const { t } = useTranslation();

  // State: Not configured
  if (!agent || !agent.custom_instructions) {
    return (
      <Card 
        className={cn(
          "border-dashed cursor-pointer transition-all hover:border-primary hover:shadow-md",
          "group"
        )}
        onClick={onConfigure}
      >
        <CardContent className="p-6">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors">
              <Bot className="h-8 w-8 text-muted-foreground group-hover:text-primary transition-colors" />
            </div>
            <div className="flex-1 space-y-1">
              <h3 className="font-semibold text-lg">Agente SDR</h3>
              <p className="text-sm text-muted-foreground">
                Configure seu assistente de vendas automatizado para qualificar leads e agendar reuniões.
              </p>
              <div className="pt-2">
                <Badge variant="outline" className="text-muted-foreground">
                  Não configurado
                </Badge>
              </div>
            </div>
            <Button variant="outline" size="sm" className="shrink-0">
              <Zap className="h-4 w-4 mr-2" />
              Configurar
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // State: Configured (active or inactive)
  const isActive = agent.is_enabled;
  const modelLabel = getModelLabel(agent.ai_provider, agent.ai_model);

  return (
    <Card 
      className={cn(
        "transition-all",
        isActive && "border-primary/50 shadow-sm"
      )}
    >
      <CardContent className="p-6">
        <div className="flex items-start gap-4">
          <div className={cn(
            "p-3 rounded-lg transition-colors",
            isActive ? "bg-primary/10" : "bg-muted"
          )}>
            <Bot className={cn(
              "h-8 w-8 transition-colors",
              isActive ? "text-primary" : "text-muted-foreground"
            )} />
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg">{agent.name}</h3>
              {isActive ? (
                <Badge className="bg-green-500/10 text-green-600 border-green-500/20 hover:bg-green-500/20">
                  Ativo
                </Badge>
              ) : (
                <Badge variant="secondary">
                  Inativo
                </Badge>
              )}
              {modelLabel && (
                <Badge variant="outline" className="text-xs">
                  {modelLabel}
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {agent.custom_instructions?.substring(0, 120)}...
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8">
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={onConfigure}>
                  <Settings className="h-4 w-4 mr-2" />
                  Editar
                </DropdownMenuItem>
                {onDuplicate && (
                  <DropdownMenuItem onClick={onDuplicate}>
                    <Copy className="h-4 w-4 mr-2" />
                    Duplicar
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            <Switch 
              checked={isActive}
              onCheckedChange={onToggle}
              disabled={isLoading}
            />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}