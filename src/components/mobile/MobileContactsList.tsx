import { useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MagnifyingGlass, Envelope, Phone } from '@phosphor-icons/react';
import { Avatar } from '@/components/base/avatar/avatar';
import { BadgeWithDot } from '@/components/base/badges/badges';
import type { BadgeColor } from '@/components/base/badges/badge-types';
import { Input } from '@/components/ui/input';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { cn } from '@/lib/utils';

interface Contact {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  company_name: string | null;
  lifecycle_stage: string;
  owner_user_id: string | null;
  created_at: string;
}

interface MobileContactsListProps {
  contacts: Contact[];
  loading: boolean;
  loadingMore: boolean;
  totalCount: number;
  hasMore: boolean;
  onLoadMore: () => void;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  stageFilter: string;
  onStageFilterChange: (value: string) => void;
  canCreate: boolean;
}

const lifecycleColors: Record<string, BadgeColor> = {
  lead: 'blue',
  qualified: 'purple',
  opportunity: 'warning',
  customer: 'success',
  churned: 'error',
  inactive: 'gray',
};

const lifecycleLabels: Record<string, string> = {
  lead: 'Lead',
  qualified: 'Qualificado',
  opportunity: 'Oportunidade',
  customer: 'Cliente',
  churned: 'Churned',
  inactive: 'Inativo',
};

const stageChips = [
  { value: 'all', label: 'Todos' },
  { value: 'lead', label: 'Lead' },
  { value: 'qualified', label: 'Qualificado' },
  { value: 'customer', label: 'Cliente' },
  { value: 'inactive', label: 'Inativo' },
];

export function MobileContactsList({
  contacts,
  loading,
  loadingMore,
  totalCount,
  hasMore,
  onLoadMore,
  searchTerm,
  onSearchChange,
  stageFilter,
  onStageFilterChange,
  canCreate,
}: MobileContactsListProps) {
  const navigate = useNavigate();
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Infinite scroll via IntersectionObserver
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMore && !loadingMore && !loading) {
          onLoadMore();
        }
      },
      { threshold: 0.1 }
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMore, loadingMore, loading, onLoadMore]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Search + summary */}
      <div className="px-4 pt-3 pb-2 space-y-2">
        <div className="relative">
          <MagnifyingGlass size={16} weight="light" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Pesquisar contatos..."
            className="pl-9 h-9 text-sm"
          />
        </div>
        <p className="text-xs text-muted-foreground font-data">
          {totalCount} contato{totalCount !== 1 ? 's' : ''}
        </p>
      </div>

      {/* Stage filter chips */}
      <div className="px-4 pb-2 flex gap-2 overflow-x-auto scrollbar-hide">
        {stageChips.map((chip) => (
          <button
            key={chip.value}
            onClick={() => onStageFilterChange(chip.value)}
            className={cn(
              'shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-colors',
              stageFilter === chip.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground'
            )}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {/* Contact list */}
      <div className="flex-1 overflow-auto px-4 py-2 space-y-2 scrollbar-hide">
        {loading && contacts.length === 0 ? (
          <div className="flex items-center justify-center py-12">
            <p className="text-sm text-muted-foreground">Carregando...</p>
          </div>
        ) : contacts.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <p className="text-sm text-muted-foreground">Nenhum contato encontrado</p>
          </div>
        ) : (
          <>
            {contacts.map((contact) => (
              <button
                key={contact.id}
                onClick={() => navigate(`/contacts/${contact.id}`)}
                className="w-full text-left bg-card border border-border rounded-md p-3 flex items-start gap-3 active:bg-muted/50 transition-colors"
              >
                <Avatar fallbackText={contact.full_name} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground truncate">
                    {contact.full_name}
                  </p>
                  <div className="flex items-center gap-2 mt-0.5">
                    {contact.phone && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Phone size={12} weight="light" />
                        {formatPhoneDisplay(contact.phone)}
                      </span>
                    )}
                    {contact.email && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1 truncate">
                        <Envelope size={12} weight="light" />
                        {contact.email}
                      </span>
                    )}
                  </div>
                  {contact.company_name && (
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      {contact.company_name}
                    </p>
                  )}
                </div>
                <BadgeWithDot
                  color={lifecycleColors[contact.lifecycle_stage] || 'gray'}
                  size="sm"
                >
                  {lifecycleLabels[contact.lifecycle_stage] || contact.lifecycle_stage || 'Lead'}
                </BadgeWithDot>
              </button>
            ))}

            {/* Infinite scroll sentinel */}
            <div ref={sentinelRef} className="h-4" />

            {loadingMore && (
              <div className="flex items-center justify-center py-3">
                <p className="text-xs text-muted-foreground">Carregando mais...</p>
              </div>
            )}
          </>
        )}
      </div>

      {/* FAB */}
      {canCreate && (
        <button
          onClick={() => navigate('/contacts/new')}
          className="fixed bottom-20 right-4 z-40 w-14 h-14 rounded-full bg-primary text-primary-foreground shadow-lg flex items-center justify-center active:scale-95 transition-transform"
        >
          <Plus size={24} weight="bold" />
        </button>
      )}
    </div>
  );
}
