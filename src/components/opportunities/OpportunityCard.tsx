import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Edit, Trash2, User, Calendar } from 'lucide-react';
import { format } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface TagInfo {
  id: string;
  name: string;
  color: string | null;
}

interface OpportunityCardProps {
  id: string;
  title: string;
  amount: number;
  currency: string;
  contactName?: string;
  closeDate?: string | null;
  locale: string;
  tags?: TagInfo[];
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
  formatCurrency: (value: number, currency: string) => string;
}

export function OpportunityCard({
  title,
  amount,
  currency,
  contactName,
  closeDate,
  locale,
  tags,
  onEdit,
  onDelete,
  onClick,
  formatCurrency,
}: OpportunityCardProps) {
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;
  const MAX_VISIBLE_TAGS = 3;
  const visibleTags = tags?.slice(0, MAX_VISIBLE_TAGS) || [];
  const overflowCount = (tags?.length || 0) - MAX_VISIBLE_TAGS;

  return (
    <Card className="p-4 bg-background hover:shadow-md transition-all cursor-pointer group" onClick={onClick}>
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

        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                className="inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-tight"
                style={{
                  backgroundColor: tag.color ? `${tag.color}20` : undefined,
                  color: tag.color || undefined,
                  borderColor: tag.color ? `${tag.color}40` : undefined,
                }}
              >
                {tag.name}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="inline-flex items-center rounded-full border border-border px-2 py-0.5 text-[10px] font-medium leading-tight text-muted-foreground">
                +{overflowCount}
              </span>
            )}
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