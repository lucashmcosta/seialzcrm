import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  MessageSquare, 
  MousePointerClick, 
  List, 
  ExternalLink, 
  Image 
} from 'lucide-react';

export type TemplateType = 'text' | 'quick-reply' | 'list-picker' | 'call-to-action' | 'media';

interface TemplateTypeSelectorProps {
  value: TemplateType;
  onValueChange: (value: TemplateType) => void;
  disabled?: boolean;
}

const templateTypes: {
  value: TemplateType;
  label: string;
  description: string;
  icon: React.ElementType;
}[] = [
  {
    value: 'text',
    label: 'Texto',
    description: 'Mensagem simples de texto',
    icon: MessageSquare,
  },
  {
    value: 'quick-reply',
    label: 'Resposta Rápida',
    description: 'Botões de resposta rápida (max 10)',
    icon: MousePointerClick,
  },
  {
    value: 'list-picker',
    label: 'Lista',
    description: 'Menu com lista de opções (max 10)',
    icon: List,
  },
  {
    value: 'call-to-action',
    label: 'Call-to-Action',
    description: 'Botões com links ou telefone',
    icon: ExternalLink,
  },
  {
    value: 'media',
    label: 'Mídia',
    description: 'Imagem, vídeo ou documento',
    icon: Image,
  },
];

export function TemplateTypeSelector({ value, onValueChange, disabled }: TemplateTypeSelectorProps) {
  const selectedType = templateTypes.find(t => t.value === value);
  const SelectedIcon = selectedType?.icon || MessageSquare;

  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger>
        <SelectValue>
          {selectedType && (
            <div className="flex items-center gap-2">
              <SelectedIcon className="w-4 h-4 text-green-600" />
              <span>{selectedType.label}</span>
            </div>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {templateTypes.map((type) => {
          const Icon = type.icon;
          return (
            <SelectItem key={type.value} value={type.value}>
              <div className="flex items-start gap-3 py-1">
                <Icon className="w-4 h-4 mt-0.5 text-green-600" />
                <div>
                  <div className="font-medium">{type.label}</div>
                  <div className="text-xs text-muted-foreground">{type.description}</div>
                </div>
              </div>
            </SelectItem>
          );
        })}
      </SelectContent>
    </Select>
  );
}
