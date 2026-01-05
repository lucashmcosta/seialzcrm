import React from 'react';
import { cn } from '@/lib/utils';

/**
 * StatusBadge Component
 * Standardized status badge with pill styling and color variants.
 * Part of the Base44 Design System.
 *
 * @param variant - Color variant: success, warning, danger, info, neutral, active
 * @param children - Badge content
 * @param className - Additional classes
 */

type StatusVariant = 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'active';

interface StatusBadgeProps {
  variant?: StatusVariant;
  children: React.ReactNode;
  className?: string;
}

const variantClasses: Record<StatusVariant, string> = {
  success: 'bg-success text-success-foreground',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  info: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
  active: 'bg-success text-success-foreground',
};

export const StatusBadge: React.FC<StatusBadgeProps> = ({ 
  variant = 'neutral', 
  children, 
  className 
}) => {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
        variantClasses[variant],
        className
      )}
    >
      {children}
    </span>
  );
};
