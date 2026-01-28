import { Badge } from '@/components/ui/badge';
import { CheckCircle, Clock, XCircle, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

export type ApprovalStatus = 'approved' | 'pending' | 'rejected' | 'not_submitted';

interface ApprovalStatusBadgeProps {
  status: ApprovalStatus | string;
  className?: string;
}

const statusConfig: Record<ApprovalStatus, {
  label: string;
  icon: React.ElementType;
  className: string;
}> = {
  approved: {
    label: 'Aprovado',
    icon: CheckCircle,
    className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 hover:bg-green-100',
  },
  pending: {
    label: 'Pendente',
    icon: Clock,
    className: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 hover:bg-yellow-100',
  },
  rejected: {
    label: 'Rejeitado',
    icon: XCircle,
    className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 hover:bg-red-100',
  },
  not_submitted: {
    label: 'Não Submetido',
    icon: AlertCircle,
    className: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-100',
  },
};

export function ApprovalStatusBadge({ status, className }: ApprovalStatusBadgeProps) {
  const config = statusConfig[status as ApprovalStatus] || statusConfig.not_submitted;
  const Icon = config.icon;

  return (
    <Badge 
      variant="secondary" 
      className={cn(config.className, 'font-medium', className)}
    >
      <Icon className="w-3 h-3 mr-1" />
      {config.label}
    </Badge>
  );
}
