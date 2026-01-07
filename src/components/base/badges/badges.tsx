import { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { BadgeColor, BadgeTypes } from "./badge-types";

interface BadgeProps {
  children: ReactNode;
  color?: BadgeColor;
  size?: "sm" | "md" | "lg";
  type?: BadgeTypes;
  icon?: ReactNode;
  className?: string;
}

const colorClasses: Record<BadgeColor, string> = {
  gray: "bg-muted text-muted-foreground",
  brand: "bg-primary/10 text-primary",
  error: "bg-destructive/10 text-destructive",
  warning: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  success: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  "blue-gray": "bg-slate-500/10 text-slate-600 dark:text-slate-400",
  "blue-light": "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  indigo: "bg-indigo-500/10 text-indigo-600 dark:text-indigo-400",
  purple: "bg-purple-500/10 text-purple-600 dark:text-purple-400",
  pink: "bg-pink-500/10 text-pink-600 dark:text-pink-400",
  orange: "bg-orange-500/10 text-orange-600 dark:text-orange-400",
};

const dotColorClasses: Record<BadgeColor, string> = {
  gray: "bg-muted-foreground",
  brand: "bg-primary",
  error: "bg-destructive",
  warning: "bg-amber-500",
  success: "bg-emerald-500",
  "blue-gray": "bg-slate-500",
  "blue-light": "bg-sky-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
  orange: "bg-orange-500",
};

const sizeClasses = {
  sm: "text-xs px-2 py-0.5",
  md: "text-sm px-2.5 py-0.5",
  lg: "text-sm px-3 py-1",
};

export const Badge = ({ 
  children, 
  color = "gray", 
  size = "sm", 
  icon,
  className 
}: BadgeProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium",
        colorClasses[color],
        sizeClasses[size],
        className
      )}
    >
      {icon}
      {children}
    </span>
  );
};

interface BadgeWithDotProps {
  children: ReactNode;
  color?: BadgeColor;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export const BadgeWithDot = ({ 
  children, 
  color = "gray", 
  size = "sm",
  className 
}: BadgeWithDotProps) => {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full font-medium",
        colorClasses[color],
        sizeClasses[size],
        className
      )}
    >
      <span className={cn("w-1.5 h-1.5 rounded-full", dotColorClasses[color])} />
      {children}
    </span>
  );
};
