import { ReactNode } from "react";
import {
  Cell,
  Column,
  Row,
  Table as AriaTable,
  TableBody as AriaTableBody,
  TableHeader as AriaTableHeader,
  type SortDescriptor,
} from "react-aria-components";
import { DotsThreeVertical, ArrowUp, ArrowDown, CaretUpDown, Minus } from "@phosphor-icons/react";
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
export { Cell as TableCell, Row as TableRow };

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
          <DotsThreeVertical className="h-4 w-4" />
        </ButtonUtility>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
};

// Table Row Action component
interface TableRowActionProps {
  label: string;
  icon?: ReactNode;
  variant?: "default" | "destructive";
  onAction: () => void;
}

export const TableRowAction = ({
  label,
  icon,
  variant = "default",
  onAction,
}: TableRowActionProps) => {
  return (
    <DropdownMenuItem
      onClick={onAction}
      className={cn(
        variant === "destructive" && "text-destructive focus:text-destructive"
      )}
    >
      {icon && <span className="mr-2">{icon}</span>}
      {label}
    </DropdownMenuItem>
  );
};

interface TableCheckboxHeaderProps {
  isSelected: boolean;
  isIndeterminate?: boolean;
  onChange: (checked: boolean) => void;
}

interface TableSelectionControlProps {
  ariaLabel: string;
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  showIndicator?: boolean;
}

const stopSelectionPropagation = (event: {
  preventDefault?: () => void;
  stopPropagation: () => void;
}) => {
  event.stopPropagation();
};

const TableSelectionControl = ({
  ariaLabel,
  checked,
  indeterminate = false,
  onChange,
  showIndicator = false,
}: TableSelectionControlProps) => {
  const isActive = checked || indeterminate;

  return (
    <button
      type="button"
      role="checkbox"
      aria-label={ariaLabel}
      aria-checked={indeterminate ? "mixed" : checked}
      onPointerDown={stopSelectionPropagation}
      onPointerUp={stopSelectionPropagation}
      onClick={(event) => {
        stopSelectionPropagation(event);
        onChange(!checked);
      }}
      onKeyDown={(event) => {
        if (event.key === " " || event.key === "Enter") {
          event.preventDefault();
          stopSelectionPropagation(event);
          onChange(!checked);
        }
      }}
      className={cn(
        "inline-flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ring-offset-background",
        isActive
          ? "border-primary bg-primary text-primary-foreground"
          : "border-muted-foreground/40 bg-background hover:border-primary/60"
      )}
    >
      {indeterminate ? (
        <Minus className="h-3 w-3" weight="bold" />
      ) : checked && showIndicator ? (
        <span className="h-2 w-2 rounded-full bg-primary-foreground" />
      ) : null}
    </button>
  );
};

export const TableCheckboxHeader = ({
  isSelected,
  isIndeterminate,
  onChange,
}: TableCheckboxHeaderProps) => {
  return (
    <Column isRowHeader className="w-12">
      <div className="inline-flex">
        <TableSelectionControl
          ariaLabel="Selecionar todos"
          checked={isSelected}
          indeterminate={isIndeterminate}
          onChange={onChange}
          showIndicator
        />
      </div>
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
      <div className="inline-flex">
        <TableSelectionControl
          ariaLabel="Selecionar linha"
          checked={isSelected}
          onChange={onChange}
        />
      </div>
    </Cell>
  );
};

// Sortable Table Column with visual indicators
interface TableColumnProps {
  id: string;
  children: ReactNode;
  allowsSorting?: boolean;
  sortDescriptor?: SortDescriptor;
  className?: string;
}

export const TableColumn = ({
  id,
  children,
  allowsSorting,
  sortDescriptor,
  className,
}: TableColumnProps) => {
  const isActive = sortDescriptor?.column === id;
  const direction = sortDescriptor?.direction;

  return (
    <Column id={id} allowsSorting={allowsSorting} className={className}>
      <div className="flex items-center gap-1">
        <span>{children}</span>
        {allowsSorting && (
          <span className="text-muted-foreground">
            {isActive ? (
              direction === "ascending" ? (
                <ArrowUp className="w-3.5 h-3.5" />
              ) : (
                <ArrowDown className="w-3.5 h-3.5" />
              )
            ) : (
              <CaretUpDown className="w-3.5 h-3.5 opacity-50" />
            )}
          </span>
        )}
      </div>
    </Column>
  );
};
