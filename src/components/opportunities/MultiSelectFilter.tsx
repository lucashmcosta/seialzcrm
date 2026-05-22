import { useState } from 'react';
import { Check, CaretDown } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';

export interface MultiSelectOption {
  value: string;
  label: string;
  color?: string | null;
}

interface MultiSelectFilterProps {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
}

export function MultiSelectFilter({
  options,
  selected,
  onChange,
  placeholder = 'Todos',
}: MultiSelectFilterProps) {
  const [open, setOpen] = useState(false);

  const toggle = (value: string) => {
    if (selected.includes(value)) {
      onChange(selected.filter((v) => v !== value));
    } else {
      onChange([...selected, value]);
    }
  };

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
      ? options.find((o) => o.value === selected[0])?.label ?? '1 selecionado'
      : `${selected.length} selecionados`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            'w-full justify-between font-normal',
            selected.length === 0 && 'text-muted-foreground'
          )}
        >
          <span className="truncate">{label}</span>
          <CaretDown size={14} weight="light" className="ml-2 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <div
          className="max-h-64 overflow-auto py-1"
          onWheel={(e) => {
            const el = e.currentTarget;
            const canScroll = el.scrollHeight > el.clientHeight;
            const atTop = el.scrollTop <= 0;
            const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 1;
            const goingDown = e.deltaY > 0;
            const goingUp = e.deltaY < 0;
            const popoverHandles =
              canScroll && ((goingDown && !atBottom) || (goingUp && !atTop));
            if (popoverHandles) return;
            const target = document.querySelector<HTMLElement>('[data-filters-scroll]');
            if (target) {
              target.scrollTop += e.deltaY;
              e.preventDefault();
            }
          }}
        >
          {options.length === 0 ? (
            <div className="px-3 py-2 text-sm text-muted-foreground">Sem opções</div>
          ) : (
            options.map((opt) => {
              const checked = selected.includes(opt.value);
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggle(opt.value)}
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm hover:bg-accent text-left"
                >
                  <Checkbox checked={checked} className="pointer-events-none" />
                  {opt.color !== undefined && (
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: opt.color || 'hsl(var(--muted-foreground))' }}
                    />
                  )}
                  <span className="truncate flex-1">{opt.label}</span>
                  {checked && <Check size={14} weight="bold" className="opacity-70" />}
                </button>
              );
            })
          )}
        </div>
        {selected.length > 0 && (
          <div className="border-t p-2">
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => onChange([])}
            >
              Limpar seleção
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
