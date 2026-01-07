import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-all focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
        secondary: "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
        destructive: "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
        outline: "text-foreground border-border",
        success: "border-transparent bg-success text-success-foreground",
        warning: "border-transparent bg-warning/20 text-warning-foreground",
        info: "border-transparent bg-primary/10 text-primary",
        neutral: "border-transparent bg-muted text-muted-foreground",
      },
      size: {
        default: "px-2.5 py-0.5 text-xs",
        sm: "px-2 py-0.5 text-[10px]",
        lg: "px-3 py-1 text-sm",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {
  /** Enable pulse animation */
  pulse?: boolean;
  /** Enable remove button */
  onRemove?: () => void;
  /** Icon to show before text */
  icon?: React.ReactNode;
}

function Badge({ className, variant, size, pulse, onRemove, icon, children, ...props }: BadgeProps) {
  return (
    <div 
      className={cn(
        badgeVariants({ variant, size }), 
        pulse && "animate-glow-pulse",
        onRemove && "pr-1",
        className
      )} 
      {...props}
    >
      {icon && <span className="mr-1">{icon}</span>}
      {children}
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="ml-1 rounded-full p-0.5 hover:bg-background/20 transition-colors"
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
            <path d="M1 1L9 9M1 9L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
        </button>
      )}
    </div>
  );
}

/**
 * AnimatedBadge - Badge com animação de entrada/saída
 */
interface AnimatedBadgeProps extends BadgeProps {
  show?: boolean;
}

function AnimatedBadge({ show = true, ...props }: AnimatedBadgeProps) {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
        >
          <Badge {...props} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * StatusBadge - Badge otimizado para status
 */
interface StatusBadgeProps {
  status: 'active' | 'inactive' | 'pending' | 'success' | 'error' | 'warning';
  label?: string;
  pulse?: boolean;
}

const statusConfig = {
  active: { variant: 'success' as const, defaultLabel: 'Ativo' },
  inactive: { variant: 'neutral' as const, defaultLabel: 'Inativo' },
  pending: { variant: 'warning' as const, defaultLabel: 'Pendente' },
  success: { variant: 'success' as const, defaultLabel: 'Sucesso' },
  error: { variant: 'destructive' as const, defaultLabel: 'Erro' },
  warning: { variant: 'warning' as const, defaultLabel: 'Atenção' },
};

function StatusBadge({ status, label, pulse }: StatusBadgeProps) {
  const config = statusConfig[status];
  return (
    <Badge variant={config.variant} pulse={pulse}>
      <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-current" />
      {label || config.defaultLabel}
    </Badge>
  );
}

export { Badge, AnimatedBadge, StatusBadge, badgeVariants };
