import { useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { extractVariables } from '@/lib/template-validation';
import { AlertCircle } from 'lucide-react';

export interface Variable {
  key: string;
  name: string;
  example: string;
}

interface VariablesTableProps {
  body: string;
  variables: Variable[];
  onChange: (variables: Variable[]) => void;
}

export function VariablesTable({ body, variables, onChange }: VariablesTableProps) {
  // Detect variables from body and sync with state
  useEffect(() => {
    const detectedVars = extractVariables(body);
    
    if (detectedVars.length === 0 && variables.length > 0) {
      onChange([]);
      return;
    }

    if (detectedVars.length !== variables.length) {
      const newVariables = detectedVars.map((key, index) => {
        const existing = variables[index];
        return {
          key,
          name: existing?.name || '',
          example: existing?.example || '',
        };
      });
      onChange(newVariables);
    }
  }, [body]);

  const handleNameChange = (index: number, name: string) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], name };
    onChange(updated);
  };

  const handleExampleChange = (index: number, example: string) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], example };
    onChange(updated);
  };

  if (variables.length === 0) {
    return (
      <div className="text-center py-6 text-muted-foreground">
        <p className="text-sm">Nenhuma variável detectada.</p>
        <p className="text-xs mt-1">
          Use {'{{1}}'}, {'{{2}}'}, etc. no corpo da mensagem para adicionar variáveis.
        </p>
      </div>
    );
  }

  const missingExamples = variables.some(v => !v.example.trim());

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Label>Variáveis Detectadas</Label>
        {missingExamples && (
          <div className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            <AlertCircle className="w-3 h-3" />
            <span>Exemplos são obrigatórios para aprovação</span>
          </div>
        )}
      </div>
      
      <div className="space-y-3">
        {variables.map((variable, index) => (
          <div key={variable.key} className="grid grid-cols-12 gap-3 items-center">
            {/* Variable key */}
            <div className="col-span-2">
              <div className="px-3 py-2 bg-muted rounded-lg text-center font-mono text-sm">
                {variable.key}
              </div>
            </div>
            
            {/* Name field */}
            <div className="col-span-4">
              <Input
                placeholder={`Nome (ex: nome_cliente)`}
                value={variable.name}
                onChange={(e) => handleNameChange(index, e.target.value)}
              />
            </div>
            
            {/* Example field */}
            <div className="col-span-6">
              <Input
                placeholder={`Exemplo (ex: João Silva)`}
                value={variable.example}
                onChange={(e) => handleExampleChange(index, e.target.value)}
                className={!variable.example.trim() ? 'border-amber-500 focus-visible:ring-amber-500' : ''}
              />
            </div>
          </div>
        ))}
      </div>
      
      <p className="text-xs text-muted-foreground">
        Os valores de exemplo são usados para aprovação do template pelo WhatsApp.
      </p>
    </div>
  );
}
