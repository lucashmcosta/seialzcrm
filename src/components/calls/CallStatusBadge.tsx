import { Badge } from '@/components/ui/badge';
import { Phone, PhoneCall, PhoneOff, PhoneMissed, Clock } from 'lucide-react';

interface CallStatusBadgeProps {
  status: string;
  showIcon?: boolean;
}

const statusConfig: Record<string, { 
  label: string; 
  variant: 'default' | 'secondary' | 'destructive' | 'outline'; 
  icon: any; 
  className: string 
}> = {
  'queued': { label: 'Na fila', variant: 'secondary', icon: Clock, className: 'text-muted-foreground' },
  'ringing': { label: 'Tocando', variant: 'default', icon: Phone, className: 'bg-yellow-500 text-white' },
  'in-progress': { label: 'Em andamento', variant: 'default', icon: PhoneCall, className: 'bg-green-500 text-white' },
  'completed': { label: 'Concluída', variant: 'outline', icon: PhoneOff, className: 'border-green-500 text-green-600' },
  'busy': { label: 'Ocupado', variant: 'destructive', icon: PhoneMissed, className: '' },
  'no-answer': { label: 'Não atendeu', variant: 'destructive', icon: PhoneMissed, className: 'bg-orange-500' },
  'canceled': { label: 'Cancelada', variant: 'secondary', icon: PhoneOff, className: '' },
  'failed': { label: 'Falhou', variant: 'destructive', icon: PhoneMissed, className: '' },
};

export function CallStatusBadge({ status, showIcon = true }: CallStatusBadgeProps) {
  const config = statusConfig[status] || statusConfig['completed'];
  const Icon = config.icon;

  return (
    <Badge variant={config.variant} className={`gap-1 ${config.className}`}>
      {showIcon && <Icon className="h-3 w-3" />}
      {config.label}
    </Badge>
  );
}
