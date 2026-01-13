import { useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { useMutation } from '@tanstack/react-query';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, X, Eye } from 'lucide-react';

interface Variable {
  name: string;
  example: string;
}

interface CreateTemplateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess?: () => void;
}

export function CreateTemplateDialog({
  open,
  onOpenChange,
  onSuccess,
}: CreateTemplateDialogProps) {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [friendlyName, setFriendlyName] = useState('');
  const [body, setBody] = useState('');
  const [language, setLanguage] = useState('pt-BR');
  const [category, setCategory] = useState('utility');
  const [variables, setVariables] = useState<Variable[]>([]);

  const resetForm = () => {
    setFriendlyName('');
    setBody('');
    setLanguage('pt-BR');
    setCategory('utility');
    setVariables([]);
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('twilio-whatsapp-templates', {
        method: 'POST',
        body: {
          organizationId: organization?.id,
          friendlyName,
          body,
          language,
          category,
          variables,
        },
      });

      if (error) throw error;
      if (data.error) throw new Error(data.error);
      return data;
    },
    onSuccess: () => {
      toast({
        description: 'Template criado com sucesso! Aguardando aprovação do WhatsApp.',
      });
      resetForm();
      onOpenChange(false);
      onSuccess?.();
    },
    onError: (error: any) => {
      toast({
        variant: 'destructive',
        description: error.message || 'Erro ao criar template',
      });
    },
  });

  const handleAddVariable = () => {
    const nextIndex = variables.length + 1;
    setVariables([...variables, { name: String(nextIndex), example: '' }]);
    // Add placeholder to body
    setBody((prev) => prev + `{{${nextIndex}}}`);
  };

  const handleRemoveVariable = (index: number) => {
    setVariables(variables.filter((_, i) => i !== index));
  };

  const handleVariableExampleChange = (index: number, example: string) => {
    const updated = [...variables];
    updated[index] = { ...updated[index], example };
    setVariables(updated);
  };

  const getPreviewBody = () => {
    let preview = body;
    variables.forEach((v, i) => {
      const placeholder = `{{${i + 1}}}`;
      preview = preview.replace(placeholder, v.example || `[Variável ${i + 1}]`);
    });
    return preview;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!friendlyName.trim() || !body.trim()) {
      toast({
        variant: 'destructive',
        description: 'Preencha o nome e o corpo do template',
      });
      return;
    }
    createMutation.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Criar Template WhatsApp</DialogTitle>
          <DialogDescription>
            Crie um novo template de mensagem. Templates precisam ser aprovados pelo WhatsApp antes de serem usados.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Friendly Name */}
            <div className="space-y-2">
              <Label htmlFor="friendlyName">Nome do Template *</Label>
              <Input
                id="friendlyName"
                value={friendlyName}
                onChange={(e) => setFriendlyName(e.target.value)}
                placeholder="Ex: boas_vindas_cliente"
                required
              />
              <p className="text-xs text-muted-foreground">
                Use apenas letras minúsculas, números e underscores
              </p>
            </div>

            {/* Language */}
            <div className="space-y-2">
              <Label>Idioma</Label>
              <Select value={language} onValueChange={setLanguage}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="es">Español</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Category */}
          <div className="space-y-2">
            <Label>Categoria</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="utility">
                  <div>
                    <span className="font-medium">Utilidade</span>
                    <p className="text-xs text-muted-foreground">
                      Notificações, atualizações, confirmações
                    </p>
                  </div>
                </SelectItem>
                <SelectItem value="marketing">
                  <div>
                    <span className="font-medium">Marketing</span>
                    <p className="text-xs text-muted-foreground">
                      Promoções, ofertas, newsletters
                    </p>
                  </div>
                </SelectItem>
                <SelectItem value="authentication">
                  <div>
                    <span className="font-medium">Autenticação</span>
                    <p className="text-xs text-muted-foreground">
                      Códigos de verificação, OTPs
                    </p>
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Body */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="body">Corpo da Mensagem *</Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleAddVariable}
              >
                <Plus className="w-3 h-3 mr-1" />
                Variável
              </Button>
            </div>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="Olá {{1}}, sua reserva foi confirmada para {{2}}."
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              Use {'{{1}}'}, {'{{2}}'}, etc. para variáveis dinâmicas
            </p>
          </div>

          {/* Variables */}
          {variables.length > 0 && (
            <div className="space-y-2">
              <Label>Exemplos das Variáveis</Label>
              <div className="space-y-2">
                {variables.map((variable, index) => (
                  <div key={index} className="flex items-center gap-2">
                    <span className="text-sm font-medium w-16 shrink-0">
                      {`{{${index + 1}}}`}
                    </span>
                    <Input
                      value={variable.example}
                      onChange={(e) => handleVariableExampleChange(index, e.target.value)}
                      placeholder={`Exemplo para variável ${index + 1}`}
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => handleRemoveVariable(index)}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview */}
          <Card className="bg-muted/50">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-2">
                <Eye className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium">Prévia</span>
              </div>
              <div className="bg-green-100 dark:bg-green-900/40 rounded-lg p-3">
                <p className="text-sm whitespace-pre-wrap">
                  {getPreviewBody() || 'Digite o corpo da mensagem para ver a prévia'}
                </p>
              </div>
            </CardContent>
          </Card>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={createMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
            >
              {createMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              Criar Template
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
