import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PhoneInput } from '@/components/ui/phone-input';
import { WhatsAppPreview } from './WhatsAppPreview';
import { useTemplates, useSendTemplate, WhatsAppTemplate } from '@/hooks/useWhatsAppTemplates';
import { useOrganization } from '@/hooks/useOrganization';
import { extractVariables } from '@/lib/template-validation';
import { Loader2, Send } from 'lucide-react';

interface SendTemplateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preSelectedTemplateId?: string;
  preSelectedPhone?: string;
  onSuccess?: () => void;
}

export function SendTemplateModal({
  open,
  onOpenChange,
  preSelectedTemplateId,
  preSelectedPhone,
  onSuccess,
}: SendTemplateModalProps) {
  const { organization } = useOrganization();
  const { data: templates, isLoading: templatesLoading } = useTemplates(organization?.id);
  const sendMutation = useSendTemplate();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [phone, setPhone] = useState('');
  const [variableValues, setVariableValues] = useState<Record<string, string>>({});

  // Filter only approved templates
  const approvedTemplates = templates?.filter(t => t.status === 'approved') || [];

  // Get selected template
  const selectedTemplate = approvedTemplates.find(t => t.id === selectedTemplateId);

  // Detect variables from selected template
  const detectedVariables = selectedTemplate ? extractVariables(selectedTemplate.body) : [];

  // Reset form when modal opens
  useEffect(() => {
    if (open) {
      setSelectedTemplateId(preSelectedTemplateId || '');
      setPhone(preSelectedPhone || '');
      setVariableValues({});
    }
  }, [open, preSelectedTemplateId, preSelectedPhone]);

  // Reset variable values when template changes
  useEffect(() => {
    setVariableValues({});
  }, [selectedTemplateId]);

  const handleVariableChange = (key: string, value: string) => {
    setVariableValues(prev => ({ ...prev, [key]: value }));
  };

  const handleSend = async () => {
    if (!selectedTemplateId || !phone || !organization?.id) return;

    await sendMutation.mutateAsync({
      organization_id: organization.id,
      to: phone,
      template_id: selectedTemplateId,
      variables: variableValues,
    });

    onOpenChange(false);
    onSuccess?.();
  };

  // Get preview with variables replaced
  const getPreviewVariables = () => {
    return detectedVariables.map((key, index) => ({
      key,
      name: `var_${index + 1}`,
      example: variableValues[key] || `[Variável ${index + 1}]`,
    }));
  };

  const isValid = selectedTemplateId && phone && 
    detectedVariables.every(key => variableValues[key]?.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Enviar Template WhatsApp</DialogTitle>
          <DialogDescription>
            Selecione um template aprovado e preencha as variáveis para enviar a mensagem.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Form */}
          <div className="space-y-4">
            {/* Template selector */}
            <div className="space-y-2">
              <Label>Template</Label>
              {templatesLoading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Carregando templates...</span>
                </div>
              ) : approvedTemplates.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Nenhum template aprovado disponível.
                </p>
              ) : (
                <Select value={selectedTemplateId} onValueChange={setSelectedTemplateId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um template" />
                  </SelectTrigger>
                  <SelectContent>
                    {approvedTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id}>
                        <div>
                          <span className="font-medium">{template.friendly_name}</span>
                          <span className="text-xs text-muted-foreground ml-2">
                            ({template.language})
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            {/* Phone input */}
            <div className="space-y-2">
              <Label>Telefone Destinatário</Label>
              <PhoneInput
                value={phone}
                onChange={setPhone}
                placeholder="(11) 99999-9999"
              />
            </div>

            {/* Variable inputs */}
            {detectedVariables.length > 0 && (
              <div className="space-y-3">
                <Label>Variáveis</Label>
                {detectedVariables.map((key, index) => {
                  const templateVar = selectedTemplate?.variables?.[index];
                  return (
                    <div key={key} className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono bg-muted px-2 py-1 rounded">
                          {key}
                        </span>
                        {templateVar?.name && (
                          <span className="text-xs text-muted-foreground">
                            {templateVar.name}
                          </span>
                        )}
                      </div>
                      <Input
                        placeholder={templateVar?.example || `Valor para ${key}`}
                        value={variableValues[key] || ''}
                        onChange={(e) => handleVariableChange(key, e.target.value)}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Preview */}
          <div>
            <Label className="mb-2 block">Prévia</Label>
            <WhatsAppPreview
              body={selectedTemplate?.body || 'Selecione um template para ver a prévia...'}
              header={selectedTemplate?.header}
              footer={selectedTemplate?.footer}
              variables={getPreviewVariables()}
              buttons={selectedTemplate?.buttons}
              actions={selectedTemplate?.actions}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button
            onClick={handleSend}
            disabled={!isValid || sendMutation.isPending}
            className="bg-green-600 hover:bg-green-700"
          >
            {sendMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Send className="w-4 h-4 mr-2" />
            )}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
