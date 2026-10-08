import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import type { OrgUserFilterOption } from '@/hooks/useOrgUserFilterOptions';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  users: OrgUserFilterOption[];
  /** ids de usuário + token 'unassigned'. Vazio = todos. */
  value: string[];
  onChange: (v: string[]) => void;
  currentUserId?: string;
  /** Sem "ver todas as conversas": só pode marcar a si mesmo e "Sem responsável" (apenas UX; o servidor também restringe). */
  canSelectOthers: boolean;
}

const initials = (name: string) =>
  name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

const rowClass =
  'flex items-center gap-3 rounded-md border border-border px-3 py-2.5 cursor-pointer hover:bg-muted/50';

export function AssigneeFilterDialog({ open, onOpenChange, users, value, onChange, currentUserId, canSelectOthers }: Props) {
  const { toast } = useToast();

  const toggle = (key: string) => {
    const isOther = key !== 'unassigned' && key !== currentUserId;
    if (isOther && !canSelectOthers && !value.includes(key)) {
      toast({
        title: 'Sem permissão',
        description: 'Você não tem permissão para ver conversas de outros responsáveis.',
        variant: 'destructive',
      });
      return;
    }
    onChange(value.includes(key) ? value.filter((v) => v !== key) : [...value, key]);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Filtrar por responsável</DialogTitle>
          <DialogDescription>
            Marque um ou mais responsáveis. Sem nenhuma marcação, mostra todos.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 py-2 max-h-[50vh] overflow-y-auto">
          <div role="button" tabIndex={0} className={rowClass} onClick={() => toggle('unassigned')}>
            <Checkbox checked={value.includes('unassigned')} className="pointer-events-none" />
            <div className="flex-1">
              <div className="text-sm font-medium text-foreground">Sem responsável</div>
              <div className="text-xs text-muted-foreground">Conversas não atribuídas</div>
            </div>
          </div>

          {users.map((u) => (
            <div key={u.id} role="button" tabIndex={0} className={rowClass} onClick={() => toggle(u.id)}>
              <Checkbox checked={value.includes(u.id)} className="pointer-events-none" />
              <Avatar className="h-6 w-6">
                {u.avatarUrl && <AvatarImage src={u.avatarUrl} alt={u.fullName} />}
                <AvatarFallback className="text-[10px]">{initials(u.fullName || '?')}</AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-foreground truncate">
                  {u.fullName || '—'}{u.id === currentUserId ? ' (você)' : ''}
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onChange([])}>
            Limpar
          </Button>
          <Button onClick={() => onOpenChange(false)}>Aplicar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
