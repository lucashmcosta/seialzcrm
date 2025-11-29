import { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Plus, Search, Filter } from 'lucide-react';
import { OpportunityDialog } from '@/components/opportunities/OpportunityDialog';
import { OpportunityCard } from '@/components/opportunities/OpportunityCard';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

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
  contacts?: {
    full_name: string;
  } | null;
}

export default function OpportunitiesKanban() {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as 'pt-BR' | 'en-US');
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingOpportunity, setEditingOpportunity] = useState<Opportunity | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

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

    // Fetch opportunities with contact info
    const { data: oppsData } = await supabase
      .from('opportunities')
      .select(`
        *,
        contacts (
          full_name
        )
      `)
      .eq('organization_id', organization.id)
      .eq('status', 'open')
      .is('deleted_at', null);

    if (oppsData) {
      setOpportunities(oppsData);
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
    return opportunities.filter((opp) => {
      const matchesStage = opp.pipeline_stage_id === stageId;
      const matchesSearch = !searchTerm || 
        opp.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
        opp.contacts?.full_name?.toLowerCase().includes(searchTerm.toLowerCase());
      return matchesStage && matchesSearch;
    });
  };

  const handleDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result;

    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;

    const opportunityId = draggableId;
    const newStageId = destination.droppableId;

    // Optimistically update UI
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
          <div>
            <h1 className="text-3xl font-bold text-foreground">{t('opportunities.title')}</h1>
            <p className="text-muted-foreground mt-1">
              Visualize e gerencie seu pipeline de vendas
            </p>
          </div>
          <Button onClick={handleNewOpportunity}>
            <Plus className="w-4 h-4 mr-2" />
            {t('opportunities.newOpportunity')}
          </Button>
        </div>

        <div className="mb-6 flex gap-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
            <Input
              placeholder="Buscar oportunidades..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-10"
            />
          </div>
        </div>

        <DragDropContext onDragEnd={handleDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4">
            {stages.map((stage) => {
              const stageOpportunities = getOpportunitiesForStage(stage.id);
              const stageTotal = stageOpportunities.reduce(
                (sum, opp) => sum + (Number(opp.amount) || 0),
                0
              );

              return (
                <div key={stage.id} className="flex-shrink-0 w-80">
                  <Card>
                    <CardHeader className="pb-3">
                      <div className="flex justify-between items-center">
                        <CardTitle className="text-base font-medium">{stage.name}</CardTitle>
                        <span className="text-sm text-muted-foreground">
                          {stageOpportunities.length}
                        </span>
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {formatCurrency(stageTotal, organization?.default_currency || 'BRL')}
                      </p>
                    </CardHeader>
                    <Droppable droppableId={stage.id}>
                      {(provided, snapshot) => (
                        <CardContent
                          ref={provided.innerRef}
                          {...provided.droppableProps}
                          className={`space-y-3 min-h-[200px] transition-colors ${
                            snapshot.isDraggingOver ? 'bg-muted/50' : ''
                          }`}
                        >
                          {stageOpportunities.length === 0 ? (
                            <p className="text-sm text-muted-foreground text-center py-8">
                              Nenhuma oportunidade
                            </p>
                          ) : (
                            stageOpportunities.map((opp, index) => (
                              <Draggable key={opp.id} draggableId={opp.id} index={index}>
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
                                      formatCurrency={formatCurrency}
                                    />
                                  </div>
                                )}
                              </Draggable>
                            ))
                          )}
                          {provided.placeholder}
                        </CardContent>
                      )}
                    </Droppable>
                  </Card>
                </div>
              );
            })}
          </div>
        </DragDropContext>
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