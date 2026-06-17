import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { OrgEndpoint } from '@/hooks/useOrgWhatsAppEndpoints';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  endpoints: OrgEndpoint[];
  officialNumbers: Set<string>;
  value: string; // endpoint id or 'all'
  onChange: (v: string) => void;
}

const digits = (s: string) => s.replace(/\D/g, '');

export function EndpointFilterDialog({ open, onOpenChange, endpoints, officialNumbers, value, onChange }: Props) {
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

          {endpoints.map((ep) => {
            const d = digits(ep.external_address);
            const isOfficial = d && officialNumbers.has(d);
            const suffix = d.slice(-4) || ep.external_address;
            const name = ep.display_name?.trim() || (isOfficial ? 'Número principal' : `Número …${suffix}`);
            return (
              <label
                key={ep.id}
                htmlFor={`ep-${ep.id}`}
                className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/50"
              >
                <RadioGroupItem value={ep.id} id={`ep-${ep.id}`} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-foreground flex items-center gap-2">
                    {name}
                    {isOfficial && (
                      <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300">
                        Principal
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{ep.external_address}</div>
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
