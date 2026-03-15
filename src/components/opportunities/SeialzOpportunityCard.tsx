import { User, Calendar, PencilSimple, TrashSimple } from '@phosphor-icons/react';
import { format } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface TagInfo {
  id: string;
  name: string;
  color: string | null;
}

interface SeialzOpportunityCardProps {
  id: string;
  title: string;
  amount: number;
  currency: string;
  contactName?: string;
  closeDate?: string | null;
  ownerName?: string;
  locale: string;
  tags?: TagInfo[];
  onEdit: () => void;
  onDelete: () => void;
  onClick: () => void;
  formatCurrency: (value: number, currency: string) => string;
}

export function SeialzOpportunityCard({
  title,
  amount,
  currency,
  contactName,
  closeDate,
  ownerName,
  locale,
  tags,
  onEdit,
  onDelete,
  onClick,
  formatCurrency,
}: SeialzOpportunityCardProps) {
  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;
  const MAX_VISIBLE_TAGS = 3;
  const visibleTags = tags?.slice(0, MAX_VISIBLE_TAGS) || [];
  const overflowCount = (tags?.length || 0) - MAX_VISIBLE_TAGS;

  // Extract first name + last initial for consultant display
  const consultantShort = ownerName
    ? (() => {
        const parts = ownerName.split(' ');
        if (parts.length === 1) return parts[0];
        return `${parts[0]} ${parts[parts.length - 1]?.[0] || ''}.`;
      })()
    : null;

  // Generate a consistent color for each owner
  const ownerDotColor = ownerName
    ? `hsl(${[...ownerName].reduce((acc, c) => acc + c.charCodeAt(0), 0) % 360}, 70%, 60%)`
    : undefined;

  return (
    <div
      className="bg-[hsl(var(--sz-bg2))] border border-[hsl(var(--sz-border))] rounded-md p-3 cursor-pointer group hover:-translate-y-px hover:border-[hsl(var(--sz-border2))] transition-all duration-150"
      onClick={onClick}
    >
      <div className="space-y-2.5">
        {/* Title + actions */}
        <div className="flex justify-between items-start">
          <h4 className="font-medium text-[13px] leading-snug text-foreground flex-1 pr-2">{title}</h4>
          <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
            <button
              className="p-1 rounded hover:bg-[hsl(var(--sz-bg4))] text-muted-foreground hover:text-foreground transition-colors"
              onClick={(e) => { e.stopPropagation(); onEdit(); }}
            >
              <PencilSimple size={12} weight="light" />
            </button>
            <button
              className="p-1 rounded hover:bg-[hsl(var(--sz-bg4))] text-muted-foreground hover:text-destructive transition-colors"
              onClick={(e) => { e.stopPropagation(); onDelete(); }}
            >
              <TrashSimple size={12} weight="light" />
            </button>
          </div>
        </div>

        {/* Contact name */}
        {contactName && (
          <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <User size={11} weight="light" />
            <span>{contactName}</span>
          </div>
        )}

        {/* Amount — green mono */}
        <p className="font-data text-[13px] text-primary leading-none">
          {formatCurrency(amount, currency)}
        </p>

        {/* Tags row */}
        {visibleTags.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {visibleTags.map((tag) => (
              <span
                key={tag.id}
                className="font-data text-[8px] uppercase tracking-wider px-1.5 py-[2px] rounded border leading-none"
                style={{
                  backgroundColor: tag.color ? `${tag.color}15` : 'hsl(var(--sz-bg3))',
                  color: tag.color || 'hsl(var(--muted-foreground))',
                  borderColor: tag.color ? `${tag.color}30` : 'hsl(var(--sz-border))',
                }}
              >
                {tag.name}
              </span>
            ))}
            {overflowCount > 0 && (
              <span className="font-data text-[8px] uppercase tracking-wider px-1.5 py-[2px] rounded border border-[hsl(var(--sz-border))] text-muted-foreground bg-[hsl(var(--sz-bg3))] leading-none">
                +{overflowCount}
              </span>
            )}
          </div>
        )}

        {/* Footer: consultant + date */}
        {(consultantShort || closeDate) && (
          <div className="flex items-center justify-between pt-1.5 border-t border-[hsl(var(--sz-border))]">
            {consultantShort && (
              <div className="flex items-center gap-1.5">
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: ownerDotColor }}
                />
                <span className="font-data text-[10px] text-muted-foreground">{consultantShort}</span>
              </div>
            )}
            {closeDate && (
              <span className="font-data text-[10px] text-[hsl(var(--sz-t3))]">
                {format(new Date(closeDate), 'dd MMM yyyy', { locale: dateLocale })}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
