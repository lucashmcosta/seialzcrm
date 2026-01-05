import React from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

/**
 * SearchBar Component
 * Standardized search input with pill styling and consistent appearance.
 * Part of the Base44 Design System.
 *
 * @param value - Current search value
 * @param onChange - Change handler
 * @param placeholder - Placeholder text
 * @param className - Additional classes
 */

interface SearchBarProps {
  value?: string;
  onChange?: (value: string) => void;
  placeholder?: string;
  className?: string;
}

export const SearchBar: React.FC<SearchBarProps> = ({
  value = '',
  onChange,
  placeholder = 'Pesquisar...',
  className,
}) => {
  return (
    <div className={cn('relative', className)}>
      <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="text"
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        placeholder={placeholder}
        className="pl-10"
      />
    </div>
  );
};
