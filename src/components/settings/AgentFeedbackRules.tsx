import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  AlertTriangle, Trash2, GripVertical, ChevronDown, ChevronUp 
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { cn } from '@/lib/utils';

interface FeedbackRule {
  id: string;
  createdAt: string;
  trigger: string;
  response: string;
  priority: number;
  isActive: boolean;
}

interface AgentFeedbackRulesProps {
  rules: FeedbackRule[];
  onUpdate: (rules: FeedbackRule[]) => void;
  maxRules?: number;
}

export function AgentFeedbackRules({
  rules,
  onUpdate,
  maxRules = 20,
}: AgentFeedbackRulesProps) {
  const [expandedRule, setExpandedRule] = useState<string | null>(null);

  const activeCount = rules.filter(r => r.isActive).length;
  const isAtLimit = activeCount >= maxRules;

  const toggleRule = (ruleId: string) => {
    const rule = rules.find(r => r.id === ruleId);
    if (!rule) return;

    // Don't allow enabling if at limit
    if (!rule.isActive && isAtLimit) {
      return;
    }

    const updated = rules.map(r => 
      r.id === ruleId ? { ...r, isActive: !r.isActive } : r
    );
    onUpdate(updated);
  };

  const deleteRule = (ruleId: string) => {
    const updated = rules.filter(r => r.id !== ruleId);
    // Recalculate priorities
    const reindexed = updated.map((r, i) => ({ ...r, priority: i + 1 }));
    onUpdate(reindexed);
  };

  const toggleExpand = (ruleId: string) => {
    setExpandedRule(prev => prev === ruleId ? null : ruleId);
  };

  if (rules.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <p className="text-sm">Nenhuma regra de feedback ainda.</p>
        <p className="text-xs mt-1">
          Regras são criadas automaticamente quando você dá feedback em mensagens do agente.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with count */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">Regras de Comportamento</span>
          <Badge variant={isAtLimit ? 'destructive' : 'secondary'}>
            {activeCount}/{maxRules}
          </Badge>
        </div>
        {isAtLimit && (
          <div className="flex items-center gap-1 text-xs text-amber-500">
            <AlertTriangle className="h-3 w-3" />
            Limite atingido
          </div>
        )}
      </div>

      {/* Rules list */}
      <ScrollArea className="max-h-[400px]">
        <div className="space-y-2 pr-4">
          {rules.map((rule) => {
            const isExpanded = expandedRule === rule.id;

            return (
              <div
                key={rule.id}
                className={cn(
                  'border rounded-lg transition-colors',
                  rule.isActive ? 'bg-card' : 'bg-muted opacity-60'
                )}
              >
                <div className="flex items-start gap-3 p-3">
                  <div className="flex items-center gap-2 mt-1">
                    <GripVertical className="h-4 w-4 text-muted-foreground cursor-move" />
                    <Switch
                      checked={rule.isActive}
                      onCheckedChange={() => toggleRule(rule.id)}
                      disabled={!rule.isActive && isAtLimit}
                    />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {rule.trigger}
                    </p>
                    {!isExpanded && (
                      <p className="text-xs text-muted-foreground truncate mt-1">
                        → {rule.response.slice(0, 60)}...
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleExpand(rule.id)}
                    >
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteRule(rule.id)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {/* Expanded content */}
                {isExpanded && (
                  <div className="px-3 pb-3 pt-0 space-y-2 border-t mt-2">
                    <div className="pt-2">
                      <p className="text-xs font-medium text-muted-foreground mb-1">
                        Resposta ideal:
                      </p>
                      <p className="text-sm p-2 bg-muted rounded">
                        {rule.response}
                      </p>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Criada em {format(new Date(rule.createdAt), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                    </p>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </div>
  );
}
