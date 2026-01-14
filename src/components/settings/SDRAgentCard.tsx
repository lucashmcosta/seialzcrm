import { Bot, Settings, Zap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { useTranslation } from '@/lib/i18n';
import { cn } from '@/lib/utils';

interface SDRAgentCardProps {
  agent: {
    id: string;
    name: string;
    is_enabled: boolean;
    custom_instructions: string | null;
  } | null;
  isLoading: boolean;
  onConfigure: () => void;
  onToggle: (enabled: boolean) => void;
}

export function SDRAgentCard({ agent, isLoading, onConfigure, onToggle }: SDRAgentCardProps) {
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
            <div className="flex items-center gap-2">
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
            </div>
            <p className="text-sm text-muted-foreground line-clamp-2">
              {agent.custom_instructions?.substring(0, 120)}...
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <Button 
              variant="outline" 
              size="sm" 
              onClick={(e) => {
                e.stopPropagation();
                onConfigure();
              }}
            >
              <Settings className="h-4 w-4 mr-2" />
              Editar
            </Button>
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
