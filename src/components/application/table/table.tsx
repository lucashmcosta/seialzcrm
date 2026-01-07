import { ReactNode, useState } from "react";
import {
  Cell,
  Column,
  Row,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  type SortDescriptor,
} from "react-aria-components";
import { MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ButtonUtility } from "@/components/base/buttons/button-utility";

// Re-export react-aria-components for convenience
export { Cell as TableCell, Row as TableRow, Column as TableColumn };

interface TableProps {
  children: ReactNode;
  sortDescriptor?: SortDescriptor;
  onSortChange?: (descriptor: SortDescriptor) => void;
  className?: string;
  "aria-label"?: string;
}

export const Table = ({
  children,
  sortDescriptor,
  onSortChange,
  className,
  "aria-label": ariaLabel = "Table",
}: TableProps) => {
  return (
    <AriaTable
      aria-label={ariaLabel}
      sortDescriptor={sortDescriptor}
      onSortChange={onSortChange}
      className={cn("w-full", className)}
    >
      {children}
    </AriaTable>
  );
};

interface TableCardProps {
  children: ReactNode;
  className?: string;
  footer?: ReactNode;
}

export const TableCard = ({ children, className, footer }: TableCardProps) => {
  return (
    <Card className={cn("overflow-hidden", className)}>
      <div className="overflow-x-auto">{children}</div>
      {footer && (
        <div className="border-t border-border px-4 py-3">{footer}</div>
      )}
    </Card>
  );
};

interface TableHeaderProps {
  children: ReactNode;
  className?: string;
}

export const TableHeader = ({ children, className }: TableHeaderProps) => {
  return (
    <AriaTableHeader
      className={cn(
        "bg-muted/50 border-b border-border",
        "[&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted-foreground [&_th]:uppercase [&_th]:tracking-wider",
        className
      )}
    >
      {children}
    </AriaTableHeader>
  );
};

interface TableBodyProps<T> {
  items: T[];
  children: (item: T) => ReactNode;
  className?: string;
}

export const TableBody = <T extends { id: string }>({
  items,
  children,
  className,
}: TableBodyProps<T>) => {
  return (
    <AriaTableBody
      items={items}
      className={cn(
        "[&_tr]:border-b [&_tr]:border-border [&_tr:last-child]:border-0",
        "[&_tr]:transition-colors [&_tr:hover]:bg-muted/50",
        "[&_td]:px-4 [&_td]:py-3",
        className
      )}
    >
      {children}
    </AriaTableBody>
  );
};

interface TableRowActionsDropdownProps {
  children: ReactNode;
}

export const TableRowActionsDropdown = ({
  children,
}: TableRowActionsDropdownProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <ButtonUtility size="sm">
          <MoreVertical className="h-4 w-4" />
        </ButtonUtility>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
};

// Convenient re-exports
export { DropdownMenuItem as TableRowAction } from "@/components/ui/dropdown-menu";

interface TableCheckboxHeaderProps {
  isSelected: boolean;
  isIndeterminate?: boolean;
  onChange: (checked: boolean) => void;
}

export const TableCheckboxHeader = ({
  isSelected,
  isIndeterminate,
  onChange,
}: TableCheckboxHeaderProps) => {
  return (
    <Column isRowHeader className="w-12">
      <Checkbox
        checked={isIndeterminate ? "indeterminate" : isSelected}
        onCheckedChange={onChange}
      />
    </Column>
  );
};

interface TableCheckboxCellProps {
  isSelected: boolean;
  onChange: (checked: boolean) => void;
}

export const TableCheckboxCell = ({
  isSelected,
  onChange,
}: TableCheckboxCellProps) => {
  return (
    <Cell className="w-12">
      <Checkbox checked={isSelected} onCheckedChange={onChange} />
    </Cell>
  );
};
