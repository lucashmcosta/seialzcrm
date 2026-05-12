import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SpinnerGap } from '@phosphor-icons/react';

interface CloseDatePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title?: string;
  description?: string;
  onConfirm: (date: string) => void | Promise<void>;
  loading?: boolean;
}

export function CloseDatePromptDialog({
  open,
  onOpenChange,
  title = 'Informe a data de fechamento',
  description = 'A data de fechamento é obrigatória para marcar a oportunidade como Ganho ou Perdido.',
  onConfirm,
  loading = false,
}: CloseDatePromptDialogProps) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);

  useEffect(() => {
    if (open) setDate(today);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="close_date_prompt">Data de fechamento</Label>
          <Input
            id="close_date_prompt"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button
            type="button"
            disabled={!date || loading}
            onClick={() => onConfirm(date)}
          >
            {loading && <SpinnerGap className="mr-2 h-4 w-4 animate-spin" />}
            Confirmar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
