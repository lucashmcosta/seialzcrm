import { Settings01 } from "@untitledui/icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export interface ColumnConfig {
  id: string;
  label: string;
  isRequired?: boolean;
}

interface ColumnSelectorProps {
  columns: ColumnConfig[];
  visibleColumns: string[];
  onChange: (columns: string[]) => void;
  label?: string;
}

export const ColumnSelector = ({
  columns,
  visibleColumns,
  onChange,
  label = "Colunas",
}: ColumnSelectorProps) => {
  const toggleColumn = (columnId: string) => {
    if (visibleColumns.includes(columnId)) {
      onChange(visibleColumns.filter((id) => id !== columnId));
    } else {
      onChange([...visibleColumns, columnId]);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings01 className="w-4 h-4 mr-2" />
          {label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 bg-popover">
        <div className="p-2 space-y-2">
          {columns.map((col) => (
            <label
              key={col.id}
              className="flex items-center gap-2 cursor-pointer hover:bg-muted/50 p-1.5 rounded-md"
            >
              <Checkbox
                checked={visibleColumns.includes(col.id)}
                onCheckedChange={() => toggleColumn(col.id)}
                disabled={col.isRequired}
              />
              <span className="text-sm">{col.label}</span>
            </label>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};
