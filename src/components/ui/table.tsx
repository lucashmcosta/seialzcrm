import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";

interface TableProps extends React.HTMLAttributes<HTMLTableElement> {
  /** Enable row hover animations */
  animated?: boolean;
}

const Table = React.forwardRef<HTMLTableElement, TableProps>(
  ({ className, animated = true, ...props }, ref) => (
    <div className="relative w-full overflow-auto rounded-xl border border-border">
      <table 
        ref={ref} 
        className={cn(
          "w-full caption-bottom text-sm",
          className
        )} 
        {...props} 
      />
    </div>
  ),
);
Table.displayName = "Table";

const TableHeader = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <thead 
      ref={ref} 
      className={cn(
        "bg-muted/50 [&_tr]:border-b",
        className
      )} 
      {...props} 
    />
  ),
);
TableHeader.displayName = "TableHeader";

const TableBody = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tbody 
      ref={ref} 
      className={cn(
        "[&_tr:last-child]:border-0",
        className
      )} 
      {...props} 
    />
  ),
);
TableBody.displayName = "TableBody";

const TableFooter = React.forwardRef<HTMLTableSectionElement, React.HTMLAttributes<HTMLTableSectionElement>>(
  ({ className, ...props }, ref) => (
    <tfoot 
      ref={ref} 
      className={cn(
        "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
        className
      )} 
      {...props} 
    />
  ),
);
TableFooter.displayName = "TableFooter";

interface TableRowProps extends React.HTMLAttributes<HTMLTableRowElement> {
  /** Enable hover glow effect */
  glow?: boolean;
  /** Make row clickable */
  clickable?: boolean;
  /** Selected state */
  selected?: boolean;
}

const TableRow = React.forwardRef<HTMLTableRowElement, TableRowProps>(
  ({ className, glow, clickable, selected, ...props }, ref) => (
    <tr
      ref={ref}
      className={cn(
        "border-b transition-all duration-normal",
        "hover:bg-muted/50",
        glow && "hover:shadow-glow-sm",
        clickable && "cursor-pointer active:bg-muted",
        selected && "bg-primary/5 hover:bg-primary/10",
        "data-[state=selected]:bg-primary/5",
        className
      )}
      {...props}
    />
  ),
);
TableRow.displayName = "TableRow";

/**
 * AnimatedTableRow - Row com animação de entrada
 */
interface AnimatedTableRowProps extends TableRowProps {
  index?: number;
}

const AnimatedTableRow = React.forwardRef<HTMLTableRowElement, AnimatedTableRowProps>(
  ({ className, index = 0, ...props }, ref) => (
    <motion.tr
      ref={ref}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      transition={{ 
        type: "spring", 
        stiffness: 300, 
        damping: 30,
        delay: index * 0.03 
      }}
      className={cn(
        "border-b transition-colors",
        "hover:bg-muted/50",
        className
      )}
      {...(props as any)}
    />
  ),
);
AnimatedTableRow.displayName = "AnimatedTableRow";

const TableHead = React.forwardRef<HTMLTableCellElement, React.ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <th
      ref={ref}
      className={cn(
        "h-11 px-4 text-left align-middle font-medium text-muted-foreground",
        "[&:has([role=checkbox])]:pr-0",
        "first:rounded-tl-xl last:rounded-tr-xl",
        className,
      )}
      {...props}
    />
  ),
);
TableHead.displayName = "TableHead";

const TableCell = React.forwardRef<HTMLTableCellElement, React.TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className, ...props }, ref) => (
    <td 
      ref={ref} 
      className={cn(
        "p-4 align-middle [&:has([role=checkbox])]:pr-0",
        className
      )} 
      {...props} 
    />
  ),
);
TableCell.displayName = "TableCell";

const TableCaption = React.forwardRef<HTMLTableCaptionElement, React.HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className, ...props }, ref) => (
    <caption 
      ref={ref} 
      className={cn(
        "mt-4 text-sm text-muted-foreground",
        className
      )} 
      {...props} 
    />
  ),
);
TableCaption.displayName = "TableCaption";

/**
 * TableEmpty - Placeholder para tabela vazia
 */
interface TableEmptyProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  colSpan?: number;
}

function TableEmpty({ icon, title, description, action, colSpan = 5 }: TableEmptyProps) {
  return (
    <TableRow>
      <TableCell colSpan={colSpan}>
        <motion.div 
          className="flex flex-col items-center justify-center py-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {icon && (
            <div className="mb-4 text-muted-foreground">
              {icon}
            </div>
          )}
          <h3 className="text-lg font-medium">{title}</h3>
          {description && (
            <p className="mt-1 text-sm text-muted-foreground max-w-sm">{description}</p>
          )}
          {action && (
            <div className="mt-4">
              {action}
            </div>
          )}
        </motion.div>
      </TableCell>
    </TableRow>
  );
}

export { 
  Table, 
  TableHeader, 
  TableBody, 
  TableFooter, 
  TableHead, 
  TableRow, 
  AnimatedTableRow,
  TableCell, 
  TableCaption,
  TableEmpty
};
