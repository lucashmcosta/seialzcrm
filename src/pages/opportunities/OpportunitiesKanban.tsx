import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Filter } from 'lucide-react';
import { Edit01, Trash01 } from '@untitledui/icons';
import { OpportunityDialog } from '@/components/opportunities/OpportunityDialog';
import { OpportunityCard } from '@/components/opportunities/OpportunityCard';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ViewSwitcher } from '@/components/common/ViewSwitcher';
import { 
  Table, TableCard, TableHeader, TableBody, TableRow, TableCell, 
  TableColumn, TableCheckboxHeader, TableCheckboxCell,
  TableRowActionsDropdown, TableRowAction 
} from '@/components/application/table/table';
import { PaginationWithPageSize } from '@/components/application/pagination/pagination';
import { ColumnSelector, type ColumnConfig } from '@/components/application/table/column-selector';
import { BadgeWithDot } from '@/components/base/badges/badges';
import { format } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import type { SortDescriptor } from 'react-aria-components';

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
  contacts?: {
    full_name: string;
  } | null;
  users?: {
    full_name: string;
  } | null;
}

interface User {
  id: string;
  full_name: string;
}

// Column configuration for table view
const availableColumns: ColumnConfig[] = [
  { id: 'title', label: 'Título', isRequired: true },
  { id: 'amount', label: 'Valor' },
  { id: 'pipeline_stage', label: 'Etapa' },
  { id: 'contact', label: 'Contato' },
  { id: 'owner', label: 'Responsável' },
  { id: 'close_date', label: 'Data Fechamento' },
];

const defaultVisibleColumns = ['title', 'amount', 'pipeline_stage', 'contact', 'owner', 'close_date'];

export default function OpportunitiesKanban() {
  const navigate = useNavigate();
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const { permissions } = usePermissions();
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [filterOwner, setFilterOwner] = useState<string>('all');
  const [filterMinAmount, setFilterMinAmount] = useState<string>('');
  const [filterMaxAmount, setFilterMaxAmount] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [showFilters, setShowFilters] = useState(false);
  
  // View mode state
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  
  // Kanban pagination states
  const CARDS_PER_STAGE = 50;
  const [stageCounts, setStageCounts] = useState<Record<string, { count: number; amount: number }>>({});
  const [opportunitiesByStage, setOpportunitiesByStage] = useState<Record<string, Opportunity[]>>({});
  const [hasMoreByStage, setHasMoreByStage] = useState<Record<string, boolean>>({});
  const [loadingMoreStage, setLoadingMoreStage] = useState<string | null>(null);
  
  // Refs for infinite scroll sentinels
  const scrollSentinelsRef = useRef<Record<string, HTMLDivElement | null>>({});
  const loadingMoreRef = useRef<string | null>(null);

  // Table view states
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(25);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [sortDescriptor, setSortDescriptor] = useState<SortDescriptor>({
    column: 'title',
    direction: 'ascending',
  });
  const [visibleColumns, setVisibleColumns] = useState<string[]>(defaultVisibleColumns);

  useEffect(() => {
    if (!organization?.id) return;
    fetchData();
  }, [organization?.id]);

  const fetchData = async () => {
    if (!organization?.id) return;
    
    setLoading(true);

    // Fetch pipeline stages
    const { data: stagesData } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('organization_id', organization.id)
      .order('order_index');

    if (stagesData) {
      setStages(stagesData);
    }

    // Fetch REAL counts from RPC (no 1000 limit)
    const { data: countsData } = await supabase
      .rpc('get_opportunity_stage_counts', { org_id: organization.id });

    if (countsData) {
      const countsMap: Record<string, { count: number; amount: number }> = {};
      countsData.forEach((item: { stage_id: string; opportunity_count: number; total_amount: number }) => {
        countsMap[item.stage_id] = {
          count: Number(item.opportunity_count),
          amount: Number(item.total_amount)
        };
      });
      setStageCounts(countsMap);
    }

    // Fetch first batch of opportunities per stage (for Kanban)
    if (stagesData) {
      const oppsByStage: Record<string, Opportunity[]> = {};
      const hasMore: Record<string, boolean> = {};
      
      await Promise.all(stagesData.map(async (stage) => {
        const { data } = await supabase
          .from('opportunities')
          .select(`
            *,
            contacts (
              full_name
            ),
            users (
              full_name
            )
          `)
          .eq('organization_id', organization.id)
          .eq('pipeline_stage_id', stage.id)
          .eq('status', 'open')
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .limit(CARDS_PER_STAGE);
        
        oppsByStage[stage.id] = data || [];
        hasMore[stage.id] = (data?.length || 0) === CARDS_PER_STAGE;
      }));
      
      setOpportunitiesByStage(oppsByStage);
      setHasMoreByStage(hasMore);
      
      // Also set flat opportunities array for table view
      const allOpps = Object.values(oppsByStage).flat();
      setOpportunities(allOpps);
    }

    // Fetch users for filter
    const { data: usersData } = await supabase
      .from('user_organizations')
      .select(`
        users (
          id,
          full_name
        )
      `)
      .eq('organization_id', organization.id)
      .eq('is_active', true);

    if (usersData) {
      const usersList = usersData
        .map((uo: any) => uo.users)
        .filter((u: any) => u !== null);
      setUsers(usersList);
    }

    setLoading(false);
  };

  const formatCurrency = (value: number, currency: string) => {
    return new Intl.NumberFormat(locale === 'en-US' ? 'en-US' : 'pt-BR', {
      style: 'currency',
      currency: currency || 'BRL',
    }).format(value);
  };

  const getOpportunitiesForStage = (stageId: string) => {
    const stageOpps = opportunitiesByStage[stageId] || [];
    return stageOpps.filter((opp) => {
      const matchesSearch = !searchTerm || 
        opp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opp.contacts?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesOwner = filterOwner === 'all' || opp.owner_user_id === filterOwner;
      
      const matchesMinAmount = !filterMinAmount || (opp.amount && Number(opp.amount) >= Number(filterMinAmount));
      const matchesMaxAmount = !filterMaxAmount || (opp.amount && Number(opp.amount) <= Number(filterMaxAmount));
      
      const matchesDateFrom = !filterDateFrom || !opp.close_date || opp.close_date >= filterDateFrom;
      const matchesDateTo = !filterDateTo || !opp.close_date || opp.close_date <= filterDateTo;
      
      return matchesSearch && matchesOwner && matchesMinAmount && matchesMaxAmount && matchesDateFrom && matchesDateTo;
    });
  };

  const loadMoreForStage = useCallback(async (stageId: string) => {
    if (!organization?.id) return;
    if (loadingMoreRef.current === stageId) return; // Prevent duplicate calls
    
    loadingMoreRef.current = stageId;
    setLoadingMoreStage(stageId);
    
    const currentOpps = opportunitiesByStage[stageId] || [];
    
    const { data } = await supabase
      .from('opportunities')
      .select(`
        *,
        contacts (
          full_name
        ),
        users (
          full_name
        )
      `)
      .eq('organization_id', organization.id)
      .eq('pipeline_stage_id', stageId)
      .eq('status', 'open')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(currentOpps.length, currentOpps.length + CARDS_PER_STAGE - 1);

    if (data) {
      setOpportunitiesByStage(prev => ({
        ...prev,
        [stageId]: [...currentOpps, ...data]
      }));
      setHasMoreByStage(prev => ({
        ...prev,
        [stageId]: data.length === CARDS_PER_STAGE
      }));
      // Update flat array too
      setOpportunities(prev => [...prev, ...data]);
    }
    setLoadingMoreStage(null);
    loadingMoreRef.current = null;
  }, [organization?.id, opportunitiesByStage]);

  // Intersection Observer for infinite scroll
  useEffect(() => {
    if (viewMode !== 'kanban') return;
    
    const observers: IntersectionObserver[] = [];
    
    stages.forEach((stage) => {
      const sentinel = scrollSentinelsRef.current[stage.id];
      if (!sentinel) return;
      
      const observer = new IntersectionObserver(
        (entries) => {
          const entry = entries[0];
          if (entry.isIntersecting && hasMoreByStage[stage.id] && !loadingMoreRef.current) {
            loadMoreForStage(stage.id);
          }
        },
        { threshold: 0.1, rootMargin: '100px' }
      );
      
      observer.observe(sentinel);
      observers.push(observer);
    });
    
    return () => observers.forEach(obs => obs.disconnect());
  }, [stages, hasMoreByStage, viewMode, loadMoreForStage]);

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const opportunityId = draggableId;
    const newStageId = destination.droppableId;
    const oldStageId = source.droppableId;

    // Find the opportunity being moved
    const movedOpp = opportunitiesByStage[oldStageId]?.find(o => o.id === opportunityId);
    if (!movedOpp) return;

    // Optimistically update UI - move between stages
    setOpportunitiesByStage(prev => {
      const updatedOpp = { ...movedOpp, pipeline_stage_id: newStageId };
      return {
        ...prev,
        [oldStageId]: prev[oldStageId]?.filter(o => o.id !== opportunityId) || [],
        [newStageId]: [...(prev[newStageId] || []), updatedOpp]
      };
    });

    // Update counts optimistically
    setStageCounts(prev => ({
      ...prev,
      [oldStageId]: {
        count: (prev[oldStageId]?.count || 1) - 1,
        amount: (prev[oldStageId]?.amount || 0) - (Number(movedOpp.amount) || 0)
      },
      [newStageId]: {
        count: (prev[newStageId]?.count || 0) + 1,
        amount: (prev[newStageId]?.amount || 0) + (Number(movedOpp.amount) || 0)
      }
    }));

    // Also update flat array for table view
    setOpportunities(prev =>
      prev.map(opp =>
        opp.id === opportunityId
          ? { ...opp, pipeline_stage_id: newStageId }
          : opp
      )
    );

    // Update in database
    const { error } = await supabase
      .from('opportunities')
      .update({ pipeline_stage_id: newStageId })
      .eq('id', opportunityId);

    if (error) {
      console.error('Error updating opportunity:', error);
      toast.error(t('common.error'));
      fetchData(); // Revert on error
    } else {
      toast.success('Oportunidade movida com sucesso');
    }
  };

  const handleEdit = (opportunity: Opportunity) => {
    setEditingOpportunity(opportunity);
    setDialogOpen(true);
  };

  const handleDelete = async () => {
    if (!deleteId) return;

    const { error } = await supabase
      .from('opportunities')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', deleteId);

    if (error) {
      toast.error(t('common.error'));
    } else {
      toast.success(t('opportunities.deleted'));
      fetchData();
    }
    setDeleteId(null);
  };

  const handleNewOpportunity = () => {
    setEditingOpportunity(null);
    setDialogOpen(true);
  };

  const clearFilters = () => {
    setFilterOwner('all');
    setFilterMinAmount('');
    setFilterMaxAmount('');
    setFilterDateFrom('');
    setFilterDateTo('');
  };

  const activeFiltersCount = [
    filterOwner !== 'all',
    filterMinAmount,
    filterMaxAmount,
    filterDateFrom,
    filterDateTo,
  ].filter(Boolean).length;

  // Filtered opportunities for table view (applies all filters except stage)
  const filteredOpportunities = useMemo(() => {
    return opportunities.filter((opp) => {
      const matchesSearch = !searchTerm || 
        opp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opp.contacts?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesOwner = filterOwner === 'all' || opp.owner_user_id === filterOwner;
      
      const matchesMinAmount = !filterMinAmount || (opp.amount && Number(opp.amount) >= Number(filterMinAmount));
      const matchesMaxAmount = !filterMaxAmount || (opp.amount && Number(opp.amount) <= Number(filterMaxAmount));
      
      const matchesDateFrom = !filterDateFrom || !opp.close_date || opp.close_date >= filterDateFrom;
      const matchesDateTo = !filterDateTo || !opp.close_date || opp.close_date <= filterDateTo;
      
      return matchesSearch && matchesOwner && matchesMinAmount && matchesMaxAmount && matchesDateFrom && matchesDateTo;
    });
  }, [opportunities, searchTerm, filterOwner, filterMinAmount, filterMaxAmount, filterDateFrom, filterDateTo]);

  // Sorted opportunities for table view
  const sortedOpportunities = useMemo(() => {
    const sorted = [...filteredOpportunities];
    if (sortDescriptor.column) {
      sorted.sort((a, b) => {
        let aValue: any;
        let bValue: any;
        
        switch (sortDescriptor.column) {
          case 'title':
            aValue = a.title?.toLowerCase() || '';
            bValue = b.title?.toLowerCase() || '';
            break;
          case 'amount':
            aValue = Number(a.amount) || 0;
            bValue = Number(b.amount) || 0;
            break;
          case 'contact':
            aValue = a.contacts?.full_name?.toLowerCase() || '';
            bValue = b.contacts?.full_name?.toLowerCase() || '';
            break;
          case 'close_date':
            aValue = a.close_date || '';
            bValue = b.close_date || '';
            break;
          case 'pipeline_stage':
            const stageA = stages.find(s => s.id === a.pipeline_stage_id);
            const stageB = stages.find(s => s.id === b.pipeline_stage_id);
            aValue = stageA?.order_index || 0;
            bValue = stageB?.order_index || 0;
            break;
          default:
            aValue = '';
            bValue = '';
        }
        
        if (aValue < bValue) return sortDescriptor.direction === 'ascending' ? -1 : 1;
        if (aValue > bValue) return sortDescriptor.direction === 'ascending' ? 1 : -1;
        return 0;
      });
    }
    return sorted;
  }, [filteredOpportunities, sortDescriptor, stages]);

  // Paginated opportunities
  const paginatedOpportunities = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return sortedOpportunities.slice(start, start + itemsPerPage);
  }, [sortedOpportunities, currentPage, itemsPerPage]);

  const totalPages = Math.ceil(sortedOpportunities.length / itemsPerPage);

  // Selection handlers
  const isAllSelected = paginatedOpportunities.length > 0 && 
    paginatedOpportunities.every(opp => selectedIds.includes(opp.id));
  const isIndeterminate = paginatedOpportunities.some(opp => selectedIds.includes(opp.id)) && !isAllSelected;

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const newIds = paginatedOpportunities.map(opp => opp.id);
      setSelectedIds(prev => [...new Set([...prev, ...newIds])]);
    } else {
      const pageIds = paginatedOpportunities.map(opp => opp.id);
      setSelectedIds(prev => prev.filter(id => !pageIds.includes(id)));
    }
  };

  const handleSelectOne = (id: string, checked: boolean) => {
    if (checked) {
      setSelectedIds(prev => [...prev, id]);
    } else {
      setSelectedIds(prev => prev.filter(i => i !== id));
    }
  };

  // Get stage name helper
  const getStageName = (stageId: string) => {
    const stage = stages.find(s => s.id === stageId);
    return stage?.name || '-';
  };

  // Format date helper
  const formatDate = (date: string | null) => {
    if (!date) return '-';
    return format(new Date(date), 'dd MMM yyyy', { locale: locale === 'en-US' ? enUS : ptBR });
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-8">
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-3xl font-bold text-foreground">{t('opportunities.title')}</h1>
          <div className="flex items-center gap-3">
            <ViewSwitcher
              view={viewMode}
              onViewChange={(v) => setViewMode(v as 'kanban' | 'list')}
              views={['list', 'kanban']}
            />
            <Button onClick={handleNewOpportunity} disabled={!permissions.canEditOpportunities}>
              <Plus className="w-4 h-4 mr-2" />
              {t('opportunities.newOpportunity')}
            </Button>
          </div>
        </div>

        <div className="mb-6 flex gap-4 items-start flex-wrap">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar oportunidades..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
          
          <Popover open={showFilters} onOpenChange={setShowFilters}>
            <PopoverTrigger asChild>
              <Button variant="outline" className="relative">
                <Filter className="h-4 w-4 mr-2" />
                Filtros
                {activeFiltersCount > 0 && (
                  <Badge variant="secondary" className="ml-2 h-5 w-5 p-0 flex items-center justify-center rounded-full">
                    {activeFiltersCount}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-80" align="end">
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium text-sm">Filtros Avançados</h4>
                  {activeFiltersCount > 0 && (
                    <Button variant="ghost" size="sm" onClick={clearFilters}>
                      Limpar
                    </Button>
                  )}
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Responsável</label>
                  <Select value={filterOwner} onValueChange={setFilterOwner}>
                    <SelectTrigger>
                      <SelectValue placeholder="Todos" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todos</SelectItem>
                      {users.map((user) => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.full_name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Valor</label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      placeholder="Mín"
                      value={filterMinAmount}
                      onChange={(e) => setFilterMinAmount(e.target.value)}
                    />
                    <Input
                      type="number"
                      placeholder="Máx"
                      value={filterMaxAmount}
                      onChange={(e) => setFilterMaxAmount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-sm font-medium">Data de Fechamento</label>
                  <div className="flex gap-2">
                    <Input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                    />
                    <Input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                    />
                  </div>
                </div>
              </div>
            </PopoverContent>
          </Popover>

          {viewMode === 'list' && (
            <ColumnSelector
              columns={availableColumns}
              visibleColumns={visibleColumns}
              onChange={setVisibleColumns}
            />
          )}
        </div>

        {viewMode === 'kanban' ? (
          <DragDropContext onDragEnd={permissions.canEditOpportunities ? handleDragEnd : () => {}}>
            <div className="flex gap-4 overflow-x-auto pb-4">
              {stages.map((stage) => {
                const stageOpportunities = getOpportunitiesForStage(stage.id);
                const realCount = stageCounts[stage.id]?.count ?? stageOpportunities.length;
                const realAmount = stageCounts[stage.id]?.amount ?? stageOpportunities.reduce(
                  (sum, opp) => sum + (Number(opp.amount) || 0),
                  0
                );
                const loadedCount = stageOpportunities.length;
                const hasMore = hasMoreByStage[stage.id] && loadedCount < realCount;

                return (
                  <div key={stage.id} className="flex-shrink-0 w-80">
                    <Card>
                      <CardHeader className="pb-3">
                        <div className="flex justify-between items-center">
                          <CardTitle className="text-base font-medium">{stage.name}</CardTitle>
                          <span className="text-sm text-muted-foreground">
                            {realCount.toLocaleString()}
                          </span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">
                          {formatCurrency(realAmount, organization?.default_currency || 'BRL')}
                        </p>
                      </CardHeader>
                      <Droppable droppableId={stage.id}>
                        {(provided, snapshot) => (
                          <CardContent
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`space-y-3 min-h-[200px] max-h-[calc(100vh-280px)] overflow-y-auto scrollbar-hide transition-colors ${
                              snapshot.isDraggingOver ? 'bg-muted/50' : ''
                            }`}
                          >
                            {stageOpportunities.length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-8">
                                Nenhuma oportunidade
                              </p>
                            ) : (
                              stageOpportunities.map((opp, index) => (
                                <Draggable 
                                  key={opp.id} 
                                  draggableId={opp.id} 
                                  index={index}
                                  isDragDisabled={!permissions.canEditOpportunities}
                                >
                                  {(provided, snapshot) => (
                                    <div
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      {...provided.dragHandleProps}
                                      style={provided.draggableProps.style}
                                      className={snapshot.isDragging ? 'opacity-50' : ''}
                                    >
                                      <OpportunityCard
                                        id={opp.id}
                                        title={opp.title}
                                        amount={Number(opp.amount)}
                                        currency={opp.currency}
                                        contactName={opp.contacts?.full_name}
                                        closeDate={opp.close_date}
                                        locale={locale}
                                        onEdit={() => handleEdit(opp)}
                                        onDelete={() => setDeleteId(opp.id)}
                                        onClick={() => navigate(`/opportunities/${opp.id}`)}
                                        formatCurrency={formatCurrency}
                                      />
                                    </div>
                                  )}
                                </Draggable>
                              ))
                            )}
                            {provided.placeholder}
                            {/* Sentinel element for infinite scroll */}
                            <div 
                              ref={(el) => { scrollSentinelsRef.current[stage.id] = el; }}
                              className="h-4 flex items-center justify-center"
                            >
                              {loadingMoreStage === stage.id && (
                                <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                              )}
                            </div>
                          </CardContent>
                        )}
                      </Droppable>
                    </Card>
                  </div>
                );
              })}
            </div>
          </DragDropContext>
        ) : (
          <TableCard
            footer={
              <PaginationWithPageSize
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={sortedOpportunities.length}
                itemsPerPage={itemsPerPage}
                onPageChange={setCurrentPage}
                onItemsPerPageChange={setItemsPerPage}
              />
            }
          >
            <Table
              aria-label="Oportunidades"
              sortDescriptor={sortDescriptor}
              onSortChange={setSortDescriptor}
            >
              <TableHeader>
                <TableCheckboxHeader
                  isSelected={isAllSelected}
                  isIndeterminate={isIndeterminate}
                  onChange={handleSelectAll}
                />
                {visibleColumns.includes('title') && (
                  <TableColumn id="title" allowsSorting sortDescriptor={sortDescriptor}>
                    Título
                  </TableColumn>
                )}
                {visibleColumns.includes('amount') && (
                  <TableColumn id="amount" allowsSorting sortDescriptor={sortDescriptor}>
                    Valor
                  </TableColumn>
                )}
                {visibleColumns.includes('pipeline_stage') && (
                  <TableColumn id="pipeline_stage" allowsSorting sortDescriptor={sortDescriptor}>
                    Etapa
                  </TableColumn>
                )}
                {visibleColumns.includes('contact') && (
                  <TableColumn id="contact" allowsSorting sortDescriptor={sortDescriptor}>
                    Contato
                  </TableColumn>
                )}
                {visibleColumns.includes('owner') && (
                  <TableColumn id="owner">Responsável</TableColumn>
                )}
                {visibleColumns.includes('close_date') && (
                  <TableColumn id="close_date" allowsSorting sortDescriptor={sortDescriptor}>
                    Data Fechamento
                  </TableColumn>
                )}
                <TableColumn id="actions" className="w-12">Ações</TableColumn>
              </TableHeader>
              <TableBody items={paginatedOpportunities}>
                {(opp) => (
                  <TableRow
                    key={opp.id}
                    className="cursor-pointer"
                    onAction={() => navigate(`/opportunities/${opp.id}`)}
                  >
                    <TableCheckboxCell
                      isSelected={selectedIds.includes(opp.id)}
                      onChange={(checked) => handleSelectOne(opp.id, checked)}
                    />
                    {visibleColumns.includes('title') && (
                      <TableCell>
                        <span className="font-medium text-foreground">{opp.title}</span>
                      </TableCell>
                    )}
                    {visibleColumns.includes('amount') && (
                      <TableCell>
                        <span className="text-foreground">
                          {formatCurrency(Number(opp.amount) || 0, opp.currency || organization?.default_currency || 'BRL')}
                        </span>
                      </TableCell>
                    )}
                    {visibleColumns.includes('pipeline_stage') && (
                      <TableCell>
                        <BadgeWithDot color="brand">
                          {getStageName(opp.pipeline_stage_id)}
                        </BadgeWithDot>
                      </TableCell>
                    )}
                    {visibleColumns.includes('contact') && (
                      <TableCell>
                        <span className="text-muted-foreground">
                          {opp.contacts?.full_name || '-'}
                        </span>
                      </TableCell>
                    )}
                    {visibleColumns.includes('owner') && (
                      <TableCell>
                        <span className="text-muted-foreground">
                          {opp.users?.full_name || '-'}
                        </span>
                      </TableCell>
                    )}
                    {visibleColumns.includes('close_date') && (
                      <TableCell>
                        <span className="text-muted-foreground">
                          {formatDate(opp.close_date)}
                        </span>
                      </TableCell>
                    )}
                    <TableCell>
                      <TableRowActionsDropdown>
                        <TableRowAction
                          label={t('common.edit')}
                          icon={<Edit01 className="h-4 w-4" />}
                          onAction={() => handleEdit(opp)}
                        />
                        <TableRowAction
                          label={t('common.delete')}
                          icon={<Trash01 className="h-4 w-4" />}
                          variant="destructive"
                          onAction={() => setDeleteId(opp.id)}
                        />
                      </TableRowActionsDropdown>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </TableCard>
        )}
      </div>

      <OpportunityDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        opportunity={editingOpportunity}
        stages={stages}
        onSuccess={fetchData}
      />

      <AlertDialog open={!!deleteId} onOpenChange={(open) => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('opportunities.deleteConfirm')}</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. A oportunidade será removida do pipeline.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>
              {t('common.delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Layout>
  );
}