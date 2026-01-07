import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { X } from "@untitledui/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface FeaturedCardCommonProps {
  title: string;
  description: ReactNode;
  confirmLabel: string;
  className?: string;
  onDismiss: () => void;
  onConfirm: () => void;
}

interface ProgressBarProps {
  progress: number;
  className?: string;
}

const ProgressBar = ({ progress, className }: ProgressBarProps) => (
  <div className={cn("h-2 w-full rounded-full bg-secondary overflow-hidden", className)}>
    <motion.div
      className="h-full bg-primary rounded-full"
      initial={{ width: 0 }}
      animate={{ width: `${progress}%` }}
      transition={{ duration: 0.5, ease: "easeOut" }}
    />
  </div>
);

const ProgressBarCircle = ({
  progress,
  size = 48,
  strokeWidth = 4,
}: {
  progress: number;
  size?: number;
  strokeWidth?: number;
}) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (progress / 100) * circumference;

  return (
    <div className="relative inline-flex items-center justify-center">
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="fill-none stroke-secondary"
          strokeWidth={strokeWidth}
        />
        <motion.circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          className="fill-none stroke-primary"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 0.8, ease: "easeOut" }}
          style={{ strokeDasharray: circumference }}
        />
      </svg>
      <span className="absolute text-xs font-semibold">{progress}%</span>
    </div>
  );
};

export const FeaturedCardProgressBar = ({
  title,
  description,
  confirmLabel,
  progress,
  className,
  onDismiss,
  onConfirm,
}: FeaturedCardCommonProps & { progress: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-4 shadow-sm",
        className
      )}
    >
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <h3 className="text-sm font-semibold text-foreground pr-6">{title}</h3>
      <p className="mt-1 text-xs text-muted-foreground">{description}</p>

      <div className="mt-3">
        <ProgressBar progress={progress} />
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={onDismiss} className="flex-1">
          Dismiss
        </Button>
        <Button size="sm" onClick={onConfirm} className="flex-1">
          {confirmLabel}
        </Button>
      </div>
    </motion.div>
  );
};

export const FeaturedCardProgressCircle = ({
  title,
  description,
  confirmLabel,
  progress,
  className,
  onDismiss,
  onConfirm,
}: FeaturedCardCommonProps & { progress: number }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "relative flex flex-col rounded-xl border bg-card p-4 shadow-sm",
        className
      )}
    >
      <button
        onClick={onDismiss}
        className="absolute top-3 right-3 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex gap-3 items-start">
        <ProgressBarCircle progress={progress} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="mt-4 flex gap-2">
        <Button variant="outline" size="sm" onClick={onDismiss} className="flex-1">
          Dismiss
        </Button>
        <Button size="sm" onClick={onConfirm} className="flex-1">
          {confirmLabel}
        </Button>
      </div>
    </motion.div>
  );
};
