import * as React from "react";
import { Input as AriaInput, TextField, Label, type InputProps as AriaInputProps } from "react-aria-components";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface InputProps extends Omit<React.ComponentProps<"input">, 'className'> {
  className?: string;
  /** Show focus glow animation */
  glowOnFocus?: boolean;
  /** Error state */
  error?: boolean;
  /** Error message */
  errorMessage?: string;
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, glowOnFocus = true, error = false, errorMessage, ...props }, ref) => {
    const [isFocused, setIsFocused] = React.useState(false);

    return (
      <div className="relative w-full">
        <motion.div
          className="relative"
          animate={isFocused && glowOnFocus ? { scale: 1.01 } : { scale: 1 }}
          transition={{ type: "spring", stiffness: 400, damping: 30 }}
        >
          <input
            type={type}
            className={cn(
              "flex h-10 w-full rounded-xl border bg-background px-4 py-2 text-base ring-offset-background",
              "file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground",
              "placeholder:text-muted-foreground",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
              "disabled:cursor-not-allowed disabled:opacity-50",
              "transition-all duration-normal",
              "md:text-sm",
              error 
                ? "border-destructive focus-visible:ring-destructive" 
                : "border-input hover:border-primary/30",
              isFocused && glowOnFocus && !error && "shadow-glow-sm",
              className,
            )}
            ref={ref}
            onFocus={(e) => {
              setIsFocused(true);
              props.onFocus?.(e);
            }}
            onBlur={(e) => {
              setIsFocused(false);
              props.onBlur?.(e);
            }}
            {...props}
          />
        </motion.div>
        
        <AnimatePresence>
          {error && errorMessage && (
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -5 }}
              transition={{ duration: 0.15 }}
              className="mt-1.5 text-xs text-destructive"
            >
              {errorMessage}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    );
  },
);
Input.displayName = "Input";

/**
 * SearchInput - Input otimizado para busca com ícone
 */
interface SearchInputProps extends InputProps {
  icon?: React.ReactNode;
  onClear?: () => void;
}

const SearchInput = React.forwardRef<HTMLInputElement, SearchInputProps>(
  ({ className, icon, onClear, ...props }, ref) => {
    return (
      <div className="relative">
        {icon && (
          <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
            {icon}
          </div>
        )}
        <Input
          ref={ref}
          className={cn(
            icon && "pl-10",
            onClear && props.value && "pr-10",
            className
          )}
          {...props}
        />
        <AnimatePresence>
          {onClear && props.value && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{ duration: 0.15 }}
              type="button"
              onClick={onClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M1 1L13 13M1 13L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </motion.button>
          )}
        </AnimatePresence>
      </div>
    );
  },
);
SearchInput.displayName = "SearchInput";

export { Input, SearchInput };
