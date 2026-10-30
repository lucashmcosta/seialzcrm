import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { 
  ChatCircle, 
  CursorClick, 
  ListBullets, 
  ArrowSquareOut, 
  Image,
  Key,
} from '@phosphor-icons/react';

export type TemplateType = 'text' | 'quick-reply' | 'list-picker' | 'call-to-action' | 'media';

interface TemplateTypeSelectorProps {
  value: TemplateType;
  onValueChange: (value: TemplateType) => void;
  disabled?: boolean;
  /** Opcional: mostra apenas a opção OTP (categoria Autenticação Meta). */
  authOnly?: boolean;
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
     icon: ChatCircle,
  },
  {
    value: 'quick-reply',
    label: 'Resposta Rápida',
    description: 'Botões de resposta rápida (max 10)',
    icon: CursorClick,
  },
  {
    value: 'list-picker',
    label: 'Lista',
    description: 'Menu com lista de opções (max 10)',
    icon: ListBullets,
  },
  {
    value: 'call-to-action',
    label: 'Call-to-Action',
    description: 'Botões com links ou telefone',
    icon: ArrowSquareOut,
  },
  {
    value: 'media',
    label: 'Mídia',
    description: 'Imagem, vídeo ou documento',
    icon: Image,
  },
];

export function TemplateTypeSelector({ value, onValueChange, disabled, authOnly }: TemplateTypeSelectorProps) {
  if (authOnly) {
    return (
      <Select value="authentication" disabled={disabled}>
        <SelectTrigger>
          <SelectValue>
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-green-600" />
              <span>Código de verificação (OTP)</span>
            </div>
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="authentication">
            <div className="flex items-start gap-3 py-1">
              <Key className="w-4 h-4 mt-0.5 text-green-600" />
              <div>
                <div className="font-medium">Código de verificação (OTP)</div>
                <div className="text-xs text-muted-foreground">Texto definido pela Meta, com botão de copiar código</div>
              </div>
            </div>
          </SelectItem>
        </SelectContent>
      </Select>
    );
  }
  const selectedType = templateTypes.find(t => t.value === value);
  const SelectedIcon = selectedType?.icon || ChatCircle;

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
