import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { OrgUserFilterOption } from '@/hooks/useOrgUserFilterOptions';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: OrgUserFilterOption[];
  /** 'all' | 'unassigned' | userId */
  value: string;
  onChange: (v: string) => void;
}

const initials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

export function AssigneeFilterDialog({ open, onOpenChange, users, value, onChange }: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Filtrar por responsável</DialogTitle>
          <DialogDescription>
            Mostrar apenas conversas atribuídas a um responsável específico.
          </DialogDescription>
        </DialogHeader>

        <RadioGroup value={value} onValueChange={onChange} className="space-y-1 py-2 max-h-[50vh] overflow-y-auto">
          <label
            htmlFor="as-all"
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/50"
          >
            <RadioGroupItem value="all" id="as-all" />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">Todos os responsáveis</div>
              <div className="text-xs text-muted-foreground">Sem filtro</div>
            </div>
          </label>

          <label
            htmlFor="as-unassigned"
            className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/50"
          >
            <RadioGroupItem value="unassigned" id="as-unassigned" />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">Sem responsável</div>
              <div className="text-xs text-muted-foreground">Conversas não atribuídas</div>
            </div>
          </label>

          {users.map((u) => (
            <label
              key={u.id}
              htmlFor={`as-${u.id}`}
              className="flex items-center gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/50"
            >
              <RadioGroupItem value={u.id} id={`as-${u.id}`} />
              <Avatar className="h-6 w-6">
                {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.fullName} />}
                <AvatarFallback className="text-[10px]">{initials(u.fullName || '?')}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">{u.fullName || '—'}</div>
              </div>
            </label>
          ))}
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
