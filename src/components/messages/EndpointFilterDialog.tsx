import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import type { SalesEndpointFilterOption } from '@/hooks/useSalesEndpointFilterOptions';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  options: SalesEndpointFilterOption[];
  value: string; // número (dígitos) ou 'all'
  onChange: (v: string) => void;
}

export function EndpointFilterDialog({ open, onOpenChange, options, value, onChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Filtrar por número</DialogTitle>
          <DialogDescription>
            Mostrar apenas conversas recebidas em um número específico do WhatsApp.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={value} onValueChange={onChange} className="space-y-1 py-2">
          <label
            htmlFor="ep-all"
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/50"
          >
            <RadioGroupItem value="all" id="ep-all" />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">Todos os números</div>
              <div className="text-xs text-muted-foreground">Sem filtro</div>
            </div>
          </label>

          {options.map((opt) => {
            const suffix = opt.key.slice(-4) || opt.address;
            const name = opt.isOfficial ? 'Número principal' : `Número …${suffix}`;
            return (
              <label
                key={opt.key}
                htmlFor={`ep-${opt.key}`}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/50"
              >
                <RadioGroupItem value={opt.key} id={`ep-${opt.key}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground flex items-center gap-2">
                    {name}
                    {opt.isOfficial && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        Principal
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{opt.address}</div>
                </div>
              </label>
            );
          })}
        </RadioGroup>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { onChange('all'); onOpenChange(false); }}>
            Limpar
          </Button>
          <Button onClick={() => onOpenChange(false)}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
