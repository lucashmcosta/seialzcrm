import React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

/**
 * PrimaryButton Component
 * Standardized primary action button with Deep Blue color and pill styling.
 * Part of the Base44 Design System.
 *
 * @param size - Button size: 'sm', 'md', 'lg'
 * @param disabled - Disabled state
 * @param children - Button content
 * @param className - Additional classes
 * @param onClick - Click handler
 */

interface PrimaryButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  size?: 'sm' | 'md' | 'lg';
  children: React.ReactNode;
}

const sizeClasses = {
  sm: 'px-4 py-2 text-sm',
  md: 'px-6 py-2.5 text-sm',
  lg: 'px-8 py-3 text-base',
};

export const PrimaryButton: React.FC<PrimaryButtonProps> = ({
  size = 'md',
  disabled = false,
  children,
  className,
  ...props
}) => {
  return (
    <Button
      disabled={disabled}
      className={cn(
        'rounded-full font-medium transition-colors',
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {children}
    </Button>
  );
};
