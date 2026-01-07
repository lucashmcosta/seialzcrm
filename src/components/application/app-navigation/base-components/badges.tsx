import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

type BadgeColor = "success" | "warning" | "error" | "info" | "gray";
type BadgeType = "modern" | "pill";
type BadgeSize = "sm" | "md";

interface BadgeWithDotProps {
  color?: BadgeColor;
  type?: BadgeType;
  size?: BadgeSize;
  children: ReactNode;
  className?: string;
}

const colorMap: Record<BadgeColor, { dot: string; bg: string; text: string }> = {
  success: {
    dot: "bg-emerald-500",
    bg: "bg-emerald-50 dark:bg-emerald-950/50",
    text: "text-emerald-700 dark:text-emerald-400",
  },
  warning: {
    dot: "bg-amber-500",
    bg: "bg-amber-50 dark:bg-amber-950/50",
    text: "text-amber-700 dark:text-amber-400",
  },
  error: {
    dot: "bg-red-500",
    bg: "bg-red-50 dark:bg-red-950/50",
    text: "text-red-700 dark:text-red-400",
  },
  info: {
    dot: "bg-blue-500",
    bg: "bg-blue-50 dark:bg-blue-950/50",
    text: "text-blue-700 dark:text-blue-400",
  },
  gray: {
    dot: "bg-muted-foreground",
    bg: "bg-muted",
    text: "text-muted-foreground",
  },
};

export const BadgeWithDot = ({
  color = "gray",
  type = "modern",
  size = "md",
  children,
  className,
}: BadgeWithDotProps) => {
  const colors = colorMap[color];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-medium",
        colors.bg,
        colors.text,
        type === "pill" ? "rounded-full" : "rounded-md",
        size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-sm",
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", colors.dot)} />
      {children}
    </span>
  );
};
