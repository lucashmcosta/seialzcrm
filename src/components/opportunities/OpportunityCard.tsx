import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface OpportunityCardProps {
  id: string;
  title: string;
  amount: number;
  currency: string;
  contactName?: string;
  closeDate?: string | null;
  locale: string;
  onEdit: () => void;
  onDelete: () => void;
  formatCurrency: (value: number, currency: string) => string;
}

export function OpportunityCard({
  title,
  amount,
  currency,
  contactName,
  closeDate,
  locale,
  onEdit,
  onDelete,
  formatCurrency,
}: OpportunityCardProps) {
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  return (
    <Card className="p-4 bg-background hover:shadow-md transition-all cursor-pointer group">
      <div className="space-y-3">
        <div className="flex justify-between items-start">
          <h4 className="font-medium text-sm flex-1 pr-2 text-foreground">{title}</h4>
          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onEdit(); }}>
              <Edit className="h-3 w-3" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={(e) => { e.stopPropagation(); onDelete(); }}>
              <Trash2 className="h-3 w-3 text-destructive" />
            </Button>
          </div>
        </div>

        {contactName && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <User className="h-3 w-3" />
            <span>{contactName}</span>
          </div>
        )}

        {closeDate && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Calendar className="h-3 w-3" />
            <span>{format(new Date(closeDate), 'dd MMM yyyy', { locale: dateLocale })}</span>
          </div>
        )}

        <div className="pt-2 border-t border-border">
          <p className="text-sm font-semibold text-primary">
            {formatCurrency(amount, currency)}
          </p>
        </div>
      </div>
    </Card>
  );
}
