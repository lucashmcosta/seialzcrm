import * as React from "react";
import { motion, type MotionProps } from "framer-motion";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium ring-offset-background transition-all duration-normal focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-glow-sm",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline: "border border-input bg-background hover:bg-accent hover:text-accent-foreground hover:border-primary/30",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-accent hover:text-accent-foreground",
        link: "text-primary underline-offset-4 hover:underline",
        success: "bg-success text-success-foreground hover:bg-success/90",
        premium: "bg-gradient-to-r from-primary to-primary-glow text-primary-foreground hover:shadow-glow",
      },
      size: {
        default: "h-10 px-6 py-2",
        sm: "h-9 rounded-full px-4 text-xs",
        lg: "h-11 rounded-full px-8 text-base",
        xl: "h-12 rounded-full px-10 text-base",
        icon: "h-10 w-10",
        "icon-sm": "h-8 w-8",
        "icon-lg": "h-12 w-12",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  /** Disable press animation */
  noAnimation?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, noAnimation = false, children, type = "button", onClick, disabled, ...props }, ref) => {
    if (asChild) {
      return (
        <Slot className={cn(buttonVariants({ variant, size, className }))} ref={ref}>
          {children}
        </Slot>
      );
    }

    if (noAnimation) {
      return (
        <button
          type={type}
          className={cn(buttonVariants({ variant, size, className }))}
          ref={ref}
          onClick={onClick}
          disabled={disabled}
          {...props}
        >
          {children}
        </button>
      );
    }

    // Use CSS for animations instead of Framer Motion to avoid prop conflicts
    return (
      <button
        type={type}
        className={cn(
          buttonVariants({ variant, size, className }),
          "transform active:scale-[0.97] hover:scale-[1.02] transition-transform"
        )}
        ref={ref}
        onClick={onClick}
        disabled={disabled}
        {...props}
      >
        {children}
      </button>
    );
  },
);
Button.displayName = "Button";

/**
 * MotionButton - Button with Framer Motion animations (for special cases)
 */
interface MotionButtonProps extends VariantProps<typeof buttonVariants> {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
  disabled?: boolean;
  type?: "button" | "submit" | "reset";
}

const MotionButton = React.forwardRef<HTMLButtonElement, MotionButtonProps>(
  ({ className, variant, size, children, onClick, disabled, type = "button" }, ref) => {
    return (
      <motion.button
        ref={ref}
        type={type}
        className={cn(buttonVariants({ variant, size, className }))}
        onClick={onClick}
        disabled={disabled}
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.97 }}
        transition={{ type: "spring", stiffness: 400, damping: 25 }}
      >
        {children}
      </motion.button>
    );
  },
);
MotionButton.displayName = "MotionButton";

/**
 * IconButton - Variante otimizada para ícones
 */
interface IconButtonProps extends ButtonProps {
  "aria-label": string;
}

const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  ({ className, size = "icon", variant = "ghost", ...props }, ref) => {
    return (
      <Button
        ref={ref}
        variant={variant}
        size={size}
        className={cn("rounded-full", className)}
        {...props}
      />
    );
  },
);
IconButton.displayName = "IconButton";

export { Button, MotionButton, IconButton, buttonVariants };
