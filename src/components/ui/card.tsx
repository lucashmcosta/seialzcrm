import * as React from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Enable hover lift effect */
  hover?: boolean;
  /** Enable glow on hover */
  glow?: boolean;
  /** Make card clickable with press animation */
  clickable?: boolean;
  /** Disable all animations */
  noAnimation?: boolean;
}

const Card = React.forwardRef<HTMLDivElement, CardProps>(
  ({ className, hover = false, glow = false, clickable = false, noAnimation = false, onClick, children, ...props }, ref) => {
    const baseClasses = cn(
      "rounded-xl border bg-card text-card-foreground shadow-sm",
      "transition-all duration-normal",
      (hover || clickable) && "hover:-translate-y-0.5 hover:shadow-md hover:border-primary/20",
      glow && "hover:shadow-glow",
      clickable && "cursor-pointer active:scale-[0.99]",
      className
    );

    if (noAnimation) {
      return (
        <div 
          ref={ref} 
          className={baseClasses}
          onClick={onClick}
          {...props}
        >
          {children}
        </div>
      );
    }

    return (
      <motion.div
        ref={ref}
        className={baseClasses}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        onClick={onClick}
      >
        {children}
      </motion.div>
    );
  }
);
Card.displayName = "Card";

const CardHeader = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex flex-col space-y-1.5 p-6", className)} {...props} />
  ),
);
CardHeader.displayName = "CardHeader";

const CardTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h3 ref={ref} className={cn("text-xl font-semibold leading-none tracking-tight", className)} {...props} />
  ),
);
CardTitle.displayName = "CardTitle";

const CardDescription = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLParagraphElement>>(
  ({ className, ...props }, ref) => (
    <p ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
  ),
);
CardDescription.displayName = "CardDescription";

const CardContent = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />,
);
CardContent.displayName = "CardContent";

const CardFooter = React.forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ className, ...props }, ref) => (
    <div ref={ref} className={cn("flex items-center p-6 pt-0", className)} {...props} />
  ),
);
CardFooter.displayName = "CardFooter";

/**
 * StatCard - Card otimizado para estatísticas/métricas
 */
interface StatCardProps extends Omit<CardProps, 'children'> {
  title: string;
  value: React.ReactNode;
  description?: string;
  icon?: React.ReactNode;
  trend?: {
    value: number;
    label?: string;
  };
}

const StatCard = React.forwardRef<HTMLDivElement, StatCardProps>(
  ({ title, value, description, icon, trend, className, ...props }, ref) => {
    const isPositive = trend && trend.value >= 0;

    return (
      <Card ref={ref} hover glow className={cn("overflow-hidden", className)} {...props}>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardDescription className="text-sm font-medium">{title}</CardDescription>
            {icon && (
              <div className="text-muted-foreground transition-transform hover:scale-110">
                {icon}
              </div>
            )}
          </div>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{value}</div>
          {(description || trend) && (
            <div className="flex items-center gap-2 mt-1">
              {trend && (
                <span
                  className={cn(
                    "text-xs font-medium",
                    isPositive ? "text-success-foreground" : "text-destructive"
                  )}
                >
                  {isPositive ? "+" : ""}{trend.value}%
                </span>
              )}
              {description && (
                <span className="text-xs text-muted-foreground">{description}</span>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    );
  }
);
StatCard.displayName = "StatCard";

export { Card, CardHeader, CardFooter, CardTitle, CardDescription, CardContent, StatCard };
