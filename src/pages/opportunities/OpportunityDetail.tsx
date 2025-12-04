import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, Edit, TrendingUp, TrendingDown, DollarSign, Calendar, User, Building2, Phone } from 'lucide-react';
import { ActivityTimeline } from '@/components/contacts/ActivityTimeline';
import { ContactTasks } from '@/components/contacts/ContactTasks';
import { ContactAttachments } from '@/components/contacts/ContactAttachments';
import { ContactCalls } from '@/components/contacts/ContactCalls';
import { OpportunityDialog } from '@/components/opportunities/OpportunityDialog';
import { ClickToCallButton } from '@/components/calls/ClickToCallButton';

interface Opportunity {
  id: string;
  title: string;
  amount: number | null;
  currency: string | null;
  status: string | null;
  close_date: string | null;
  contact_id: string | null;
  pipeline_stage_id: string;
  contacts?: { full_name: string; phone: string | null } | null;
  pipeline_stages?: { name: string; type: string } | null;
  users?: { full_name: string } | null;
}

interface PipelineStage {
  id: string;
  name: string;
  type: string;
}

export default function OpportunityDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { permissions } = usePermissions();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [stages, setStages] = useState<PipelineStage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  useEffect(() => {
    if (organization && id) {
      fetchOpportunity();
      fetchStages();
    }
  }, [organization, id]);

  const fetchOpportunity = async () => {
    if (!organization || !id) return;

    const { data, error } = await supabase
      .from('opportunities')
      .select(`
        *,
        contacts(full_name, phone),
        pipeline_stages(name, type),
        users(full_name)
      `)
      .eq('id', id)
      .eq('organization_id', organization.id)
      .is('deleted_at', null)
      .single();

    if (error) {
      console.error('Error fetching opportunity:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
      navigate('/opportunities');
      return;
    }

    setOpportunity(data);
    setLoading(false);
  };

  const fetchStages = async () => {
    if (!organization) return;

    const { data } = await supabase
      .from('pipeline_stages')
      .select('*')
      .eq('organization_id', organization.id)
      .order('order_index');

    if (data) setStages(data);
  };

  const formatCurrency = (value: number) => {
    const currencyCode = opportunity?.currency || organization?.default_currency || 'BRL';
    const userLocale = locale || organization?.default_locale || 'pt-BR';
    
    return new Intl.NumberFormat(userLocale, {
      style: 'currency',
      currency: currencyCode,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleMarkWon = async () => {
    if (!opportunity || !organization) return;
    const wonStage = stages.find((s) => s.type === 'won');
    if (!wonStage) return;

    try {
      const { error } = await supabase
        .from('opportunities')
        .update({
          status: 'won',
          pipeline_stage_id: wonStage.id,
        })
        .eq('id', opportunity.id);

      if (error) throw error;

      toast({ title: t('opportunities.updated') });
      fetchOpportunity();
    } catch (error) {
      console.error('Error marking as won:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const handleMarkLost = async () => {
    if (!opportunity || !organization) return;
    const lostStage = stages.find((s) => s.type === 'lost');
    if (!lostStage) return;

    try {
      const { error } = await supabase
        .from('opportunities')
        .update({
          status: 'lost',
          pipeline_stage_id: lostStage.id,
        })
        .eq('id', opportunity.id);

      if (error) throw error;

      toast({ title: t('opportunities.updated') });
      fetchOpportunity();
    } catch (error) {
      console.error('Error marking as lost:', error);
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">{t('common.loading')}</p>
        </div>
      </Layout>
    );
  }

  if (!opportunity) {
    return (
      <Layout>
        <div className="flex items-center justify-center h-full">
          <p className="text-muted-foreground">{t('common.noResults')}</p>
        </div>
      </Layout>
    );
  }

  const statusColor =
    opportunity.status === 'won'
      ? 'bg-green-500'
      : opportunity.status === 'lost'
      ? 'bg-red-500'
      : 'bg-blue-500';

  const contactPhone = opportunity.contacts?.phone;
  const contactName = opportunity.contacts?.full_name;

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="px-6 py-4 space-y-4">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/opportunities')}>
                <ArrowLeft className="h-4 w-4 mr-2" />
                {t('common.back')}
              </Button>
            </div>

            <div className="flex items-start justify-between">
              <div className="space-y-2">
                <h1 className="text-3xl font-bold text-foreground">{opportunity.title}</h1>
                <div className="flex items-center gap-4 text-sm text-muted-foreground">
                  {opportunity.contacts && (
                    <Link
                      to={`/contacts/${opportunity.contact_id}`}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      <User className="h-4 w-4" />
                      {opportunity.contacts.full_name}
                    </Link>
                  )}
                  {opportunity.pipeline_stages && (
                    <span className="flex items-center gap-1">
                      <Building2 className="h-4 w-4" />
                      {opportunity.pipeline_stages.name}
                    </span>
                  )}
                  {opportunity.close_date && (
                    <span className="flex items-center gap-1">
                      <Calendar className="h-4 w-4" />
                      {new Date(opportunity.close_date).toLocaleDateString(locale)}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Badge className={statusColor}>
                  {opportunity.status === 'won'
                    ? t('status.won')
                    : opportunity.status === 'lost'
                    ? t('status.lost')
                    : t('status.open')}
                </Badge>
                <div className="flex items-center gap-1 text-2xl font-bold text-foreground">
                  <DollarSign className="h-6 w-6" />
                  {formatCurrency(opportunity.amount || 0)}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {contactPhone && (
                <ClickToCallButton
                  phoneNumber={contactPhone}
                  contactId={opportunity.contact_id || undefined}
                  opportunityId={opportunity.id}
                  size="sm"
                />
              )}
              {permissions.canEditOpportunities && (
                <>
                  <Button onClick={() => setEditDialogOpen(true)}>
                    <Edit className="h-4 w-4 mr-2" />
                    {t('common.edit')}
                  </Button>
                  {opportunity.status === 'open' && (
                    <>
                      <Button variant="outline" onClick={handleMarkWon}>
                        <TrendingUp className="h-4 w-4 mr-2" />
                        {t('opportunities.markWon')}
                      </Button>
                      <Button variant="outline" onClick={handleMarkLost}>
                        <TrendingDown className="h-4 w-4 mr-2" />
                        {t('opportunities.markLost')}
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto">
          <Tabs defaultValue="timeline" className="h-full">
            <div className="border-b px-6">
              <TabsList>
                <TabsTrigger value="timeline">{t('contacts.timeline')}</TabsTrigger>
                <TabsTrigger value="calls">
                  <Phone className="h-4 w-4 mr-2" />
                  Chamadas
                </TabsTrigger>
                <TabsTrigger value="tasks">{t('contacts.tasksTab')}</TabsTrigger>
                <TabsTrigger value="attachments">{t('attachments.title')}</TabsTrigger>
              </TabsList>
            </div>

            <div className="p-6">
              <TabsContent value="timeline" className="mt-0">
                <ActivityTimeline opportunityId={opportunity.id} />
              </TabsContent>

              <TabsContent value="calls" className="mt-0">
                {opportunity.contact_id ? (
                  <ContactCalls 
                    contactId={opportunity.contact_id} 
                    opportunityId={opportunity.id}
                    contactPhone={contactPhone || undefined}
                    contactName={contactName || undefined}
                  />
                ) : (
                  <Card>
                    <CardContent className="py-8 text-center text-muted-foreground">
                      Esta oportunidade não tem um contato associado.
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="tasks" className="mt-0">
                <ContactTasks opportunityId={opportunity.id} />
              </TabsContent>

              <TabsContent value="attachments" className="mt-0">
                <ContactAttachments entityId={opportunity.id} entityType="opportunity" />
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </div>

      <OpportunityDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        opportunity={opportunity}
        stages={stages}
        onSuccess={fetchOpportunity}
      />
    </Layout>
  );
}
