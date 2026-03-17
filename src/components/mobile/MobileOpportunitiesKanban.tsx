import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MagnifyingGlass } from '@phosphor-icons/react';
import { SeialzOpportunityCard } from '@/components/opportunities/SeialzOpportunityCard';
import { OpportunityDialog } from '@/components/opportunities/OpportunityDialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface TagInfo {
  id: string;
  name: string;
  color: string | null;
}

interface PipelineStage {
  id: string;
  name: string;
  order_index: number;
  type: string;
}

interface Opportunity {
  id: string;
  title: string;
  amount: number;
  currency: string;
  pipeline_stage_id: string;
  contact_id: string | null;
  close_date: string | null;
  owner_user_id: string | null;
  contacts?: { full_name: string } | null;
  users?: { full_name: string } | null;
}

// Stage color bars for chips
const STAGE_COLORS = [
  'hsl(153 100% 50%)',
  'hsl(220 100% 63%)',
  'hsl(43 100% 50%)',
  'hsl(270 100% 70%)',
  'hsl(350 100% 63%)',
  'hsl(180 100% 50%)',
  'hsl(30 100% 55%)',
];

interface MobileOpportunitiesKanbanProps {
  stages: PipelineStage[];
  stageCounts: Record<string, { count: number; amount: number }>;
  opportunitiesByStage: Record<string, Opportunity[]>;
  hasMoreByStage: Record<string, boolean>;
  searchTerm: string;
  onSearchChange: (value: string) => void;
  searchResults: Opportunity[] | null;
  tagsByOpportunity: Record<string, TagInfo[]>;
  locale: string;
  formatCurrency: (value: number, currency: string) => string;
  onRefresh: () => void;
  organizationId: string;
  loadMoreForStage: (stageId: string) => void;
  loadingMoreStage: string | null;
  // Filters
  filterOwner: string;
  filterTag: string;
}

export function MobileOpportunitiesKanban({
  stages,
  stageCounts,
  opportunitiesByStage,
  hasMoreByStage,
  searchTerm,
  onSearchChange,
  searchResults,
  tagsByOpportunity,
  locale,
  formatCurrency,
  onRefresh,
  organizationId,
  loadMoreForStage,
  loadingMoreStage,
  filterOwner,
  filterTag,
}: MobileOpportunitiesKanbanProps) {
  const navigate = useNavigate();
  const [activeStageId, setActiveStageId] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const chipScrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Default to first stage
  useEffect(() => {
    if (stages.length > 0 && !activeStageId) {
      setActiveStageId(stages[0].id);
    }
  }, [stages, activeStageId]);

  // Infinite scroll for current stage
  useEffect(() => {
    if (!activeStageId || !sentinelRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && hasMoreByStage[activeStageId]) {
          loadMoreForStage(activeStageId);
        }
      },
      { threshold: 0.1, rootMargin: '200px' }
    );

    observer.observe(sentinelRef.current);
    return () => observer.disconnect();
  }, [activeStageId, hasMoreByStage, loadMoreForStage]);

  // Get filtered opportunities for active stage
  const getOppsForStage = useCallback((stageId: string) => {
    const stageOpps = searchResults !== null
      ? searchResults.filter(opp => opp.pipeline_stage_id === stageId)
      : (opportunitiesByStage[stageId] || []);

    return stageOpps.filter((opp) => {
      const matchesOwner = filterOwner === 'all' || opp.owner_user_id === filterOwner;
      const matchesTag = filterTag === 'all' || (tagsByOpportunity[opp.id]?.some(t => t.id === filterTag));
      return matchesOwner && matchesTag;
    });
  }, [searchResults, opportunitiesByStage, filterOwner, filterTag, tagsByOpportunity]);

  const activeOpportunities = activeStageId ? getOppsForStage(activeStageId) : [];

  // Pipeline totals
  const totalDeals = Object.values(stageCounts).reduce((sum, s) => sum + s.count, 0);
  const totalAmount = Object.values(stageCounts).reduce((sum, s) => sum + s.amount, 0);

  const handleEdit = (opp: Opportunity) => {
    setEditingOpportunity(opp);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from('opportunities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteId);

    if (error) {
      toast.error('Erro ao excluir');
    } else {
      toast.success('Oportunidade excluída');
      onRefresh();
    }
    setDeleteId(null);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Search + Pipeline summary */}
      <div className="px-4 pt-4 pb-2 space-y-3 flex-shrink-0">
        {/* Search */}
        <div className="relative">
          <MagnifyingGlass size={16} weight="light" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="text"
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar oportunidade..."
            className="pl-9 h-9 text-sm"
          />
        </div>

        {/* Pipeline summary */}
        <div className="flex items-center gap-2">
          <span className="font-data text-[11px] text-muted-foreground">
            {totalDeals} {totalDeals === 1 ? 'negócio' : 'negócios'}
          </span>
          <span className="text-[hsl(var(--sz-border2))]">·</span>
          <span className="font-data text-[13px] text-primary font-medium">
            {formatCurrency(totalAmount, 'BRL')}
          </span>
        </div>
      </div>

      {/* Stage chips — horizontal scroll */}
      <div className="flex-shrink-0 border-b border-border">
        <div
          ref={chipScrollRef}
          className="flex gap-2 overflow-x-auto px-4 py-2.5 scrollbar-hide"
        >
          {stages.map((stage, idx) => {
            const isActive = stage.id === activeStageId;
            const stageColor = STAGE_COLORS[idx % STAGE_COLORS.length];
            const count = stageCounts[stage.id]?.count || 0;

            return (
              <button
                key={stage.id}
                onClick={() => setActiveStageId(stage.id)}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-[11px] font-medium whitespace-nowrap transition-all flex-shrink-0 border',
                  isActive
                    ? 'bg-[hsl(var(--sz-bg3))] border-[hsl(var(--sz-border2))] text-foreground'
                    : 'bg-[hsl(var(--sz-bg2))] border-[hsl(var(--sz-border))] text-muted-foreground'
                )}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: stageColor }}
                />
                {stage.name}
                <span className="font-data text-[10px] opacity-60">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Card list */}
      <div className="flex-1 overflow-auto px-4 py-3 space-y-2.5">
        {activeOpportunities.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-sm text-muted-foreground">Nenhuma oportunidade nesta etapa</p>
          </div>
        ) : (
          activeOpportunities.map((opp) => (
            <SeialzOpportunityCard
              key={opp.id}
              id={opp.id}
              title={opp.title}
              amount={opp.amount}
              currency={opp.currency}
              contactName={opp.contacts?.full_name}
              closeDate={opp.close_date}
              ownerName={opp.users?.full_name}
              locale={locale}
              tags={tagsByOpportunity[opp.id]}
              onEdit={() => handleEdit(opp)}
              onDelete={() => setDeleteId(opp.id)}
              onClick={() => navigate(`/opportunities/${opp.id}`)}
              formatCurrency={formatCurrency}
            />
          ))
        )}

        {/* Infinite scroll sentinel */}
        {activeStageId && hasMoreByStage[activeStageId] && (
          <div ref={sentinelRef} className="h-8 flex items-center justify-center">
            {loadingMoreStage === activeStageId && (
              <span className="font-data text-[10px] text-muted-foreground">Carregando...</span>
            )}
          </div>
        )}
      </div>

      {/* FAB */}
      <button
        onClick={() => { setEditingOpportunity(null); setDialogOpen(true); }}
        className="fixed right-4 bottom-[calc(56px+16px+env(safe-area-inset-bottom,0px))] z-20 w-12 h-12 rounded-md bg-primary text-primary-foreground flex items-center justify-center shadow-lg active:scale-95 transition-transform"
      >
        <Plus size={22} weight="bold" />
      </button>

      {/* Dialog — reuse existing */}
      <OpportunityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        opportunity={editingOpportunity}
        onSuccess={onRefresh}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir oportunidade</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir esta oportunidade?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
