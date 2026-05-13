import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Key } from 'react-aria-components';
import { Layout } from '@/components/Layout';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs } from '@/components/application/tabs/tabs';
import { NativeSelect } from '@/components/base/select/select-native';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { toast } from '@/hooks/use-toast';
import { ArrowLeft, PencilSimple, TrendUp, TrendDown, DotsThreeVertical, Phone } from '@phosphor-icons/react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { formatDateOnly } from '@/lib/utils';
import { ActivityTimeline } from '@/components/contacts/ActivityTimeline';
import { ContactTasks } from '@/components/contacts/ContactTasks';
import { ContactAttachments } from '@/components/contacts/ContactAttachments';
import { ContactCalls } from '@/components/contacts/ContactCalls';
import { ContactMessages } from '@/components/contacts/ContactMessages';
import { ContactNotes } from '@/components/contacts/ContactNotes';
import { OpportunityDialog } from '@/components/opportunities/OpportunityDialog';
import { CloseDatePromptDialog } from '@/components/opportunities/CloseDatePromptDialog';
import { ClickToCallButton } from '@/components/calls/ClickToCallButton';
import { OwnerSelector } from '@/components/common/OwnerSelector';
import { SendToSignatureButton } from '@/components/signature/SendToSignatureButton';
import { TagSelector } from '@/components/common/TagSelector';

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
  const [selectedTab, setSelectedTab] = useState<Key>('overview');
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [pendingStatus, setPendingStatus] = useState<'won' | 'lost' | null>(null);
  const { userProfile } = useOrganization();

  const tabs = [
    { id: 'overview', label: t('opportunities.overviewTab') },
    { id: 'timeline', label: t('contacts.timeline') },
    { id: 'calls', label: t('contacts.callsTab') },
    { id: 'messages', label: t('contacts.messagesTab') },
    { id: 'tasks', label: t('contacts.tasksTab') },
    { id: 'attachments', label: t('attachments.title') },
    { id: 'notes', label: t('contacts.notesTab') },
  ];

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

    // Fetch created_by / updated_by names
    const byIds = [(data as any)?.created_by, (data as any)?.updated_by].filter(Boolean) as string[];
    if (byIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', byIds);
      const map = new Map((users || []).map((u: any) => [u.id, u.full_name]));
      setCreatedByName((data as any)?.created_by ? map.get((data as any).created_by) || 'Sistema' : null);
      setUpdatedByName((data as any)?.updated_by ? map.get((data as any).updated_by) || 'Sistema' : null);
    } else {
      setCreatedByName(null);
      setUpdatedByName(null);
    }

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

  const applyStatusChange = async (newStatus: 'won' | 'lost', closeDate: string) => {
    if (!opportunity || !organization) return;
    const targetStage = stages.find((s) => s.type === newStatus);
    if (!targetStage) return;

    try {
      const { error } = await supabase
        .from('opportunities')
        .update({
          status: newStatus,
          pipeline_stage_id: targetStage.id,
          close_date: closeDate,
          updated_by: userProfile?.id || null,
        } as any)
        .eq('id', opportunity.id);

      if (error) throw error;

      toast({ title: t('opportunities.updated') });
      setPendingStatus(null);
      fetchOpportunity();
    } catch (error) {
      console.error(`Error marking as ${newStatus}:`, error);
      toast({ title: t('common.error'), variant: 'destructive' });
    }
  };

  const handleMarkWon = async () => {
    if (!opportunity) return;
    if (opportunity.close_date) {
      await applyStatusChange('won', opportunity.close_date);
    } else {
      setPendingStatus('won');
    }
  };

  const handleMarkLost = async () => {
    if (!opportunity) return;
    if (opportunity.close_date) {
      await applyStatusChange('lost', opportunity.close_date);
    } else {
      setPendingStatus('lost');
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="p-6 space-y-6">
          <div className="flex items-center gap-4">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-7 w-56" />
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-4">
              <Skeleton className="h-24 w-full rounded-lg" />
              <Skeleton className="h-48 w-full rounded-lg" />
            </div>
            <div className="space-y-4">
              {[...Array(6)].map((_, i) => (
                <div key={i} className="flex justify-between">
                  <Skeleton className="h-4 w-20" />
                  <Skeleton className="h-4 w-32" />
                </div>
              ))}
            </div>
          </div>
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

  const isClosed = opportunity.status === 'won' || opportunity.status === 'lost';

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
          <div className="px-6 py-3 space-y-3">
            {/* Linha 1: Voltar + Ações */}
            <div className="flex items-center justify-between">
              <Button
                variant="ghost"
                size="sm"
                className="-ml-2 h-7 px-2 text-muted-foreground hover:text-foreground"
                onClick={() => navigate('/opportunities')}
              >
                <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
                {t('common.back')}
              </Button>

              <div className="flex items-center gap-1.5">
                {permissions.canEditOpportunities && (
                  <Button size="sm" onClick={() => setEditDialogOpen(true)}>
                    <PencilSimple className="h-3.5 w-3.5 mr-1.5" />
                    {t('common.edit')}
                  </Button>
                )}
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="h-8 w-8 p-0">
                      <DotsThreeVertical className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-56">
                    {contactPhone && (
                      <div className="px-1 py-0.5 [&_button]:w-full [&_button]:justify-start">
                        <ClickToCallButton
                          phoneNumber={contactPhone}
                          contactId={opportunity.contact_id || undefined}
                          opportunityId={opportunity.id}
                          size="sm"
                        />
                      </div>
                    )}
                    {opportunity.contact_id && (
                      <div className="px-1 py-0.5 [&_button]:w-full [&_button]:justify-start">
                        <SendToSignatureButton
                          contactId={opportunity.contact_id}
                          opportunityId={opportunity.id}
                        />
                      </div>
                    )}
                    {permissions.canEditOpportunities && opportunity.status === 'open' && (
                      <>
                        {(contactPhone || opportunity.contact_id) && <DropdownMenuSeparator />}
                        <DropdownMenuItem onClick={handleMarkWon}>
                          <TrendUp className="h-4 w-4 mr-2" />
                          {t('opportunities.markWon')}
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={handleMarkLost}>
                          <TrendDown className="h-4 w-4 mr-2" />
                          {t('opportunities.markLost')}
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>

            {/* Linha 2: Título + Status/Valor */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0 flex-1 space-y-1">
                <h1 className="text-xl font-semibold text-foreground truncate">{opportunity.title}</h1>
                <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                  {opportunity.contacts && (
                    <Link
                      to={`/contacts/${opportunity.contact_id}`}
                      className="hover:text-foreground transition-colors"
                    >
                      {opportunity.contacts.full_name}
                    </Link>
                  )}
                  {opportunity.contacts && opportunity.pipeline_stages && <span>·</span>}
                  {opportunity.pipeline_stages && (
                    <span>{opportunity.pipeline_stages.name}</span>
                  )}
                  {opportunity.pipeline_stages && opportunity.close_date && <span>·</span>}
                  {opportunity.close_date && (
                    <span>{formatDateOnly(opportunity.close_date, locale)}</span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-3 shrink-0">
                <Badge className={statusColor}>
                  {opportunity.status === 'won'
                    ? t('status.won')
                    : opportunity.status === 'lost'
                    ? t('status.lost')
                    : t('status.open')}
                </Badge>
                <div className="text-lg font-semibold text-foreground tabular-nums">
                  {formatCurrency(opportunity.amount || 0)}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          {/* Mobile: Native Select */}
          <NativeSelect
            aria-label="Tabs"
            value={selectedTab as string}
            onChange={(e) => setSelectedTab(e.target.value)}
            options={tabs.map((tab) => ({ label: tab.label, value: tab.id }))}
            className="w-full md:hidden mb-4"
          />

          {/* Desktop: Underline Tabs */}
          <Tabs selectedKey={selectedTab} onSelectionChange={setSelectedTab}>
            <Tabs.List type="underline" items={tabs} className="max-md:hidden">
              {(tab) => <Tabs.Item key={tab.id} id={tab.id} label={tab.label} />}
            </Tabs.List>

            <Tabs.Panel id="overview">
              <Card>
                <CardContent className="pt-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('opportunities.value')}</p>
                        <p className="text-lg font-semibold">{formatCurrency(opportunity.amount || 0)}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('opportunities.stage')}</p>
                        <p className="text-lg font-semibold">{opportunity.pipeline_stages?.name || '-'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('opportunities.closeDate')}</p>
                        <p className="text-lg font-semibold">
                          {opportunity.close_date 
                            ? formatDateOnly(opportunity.close_date, locale)
                            : '-'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('common.status')}</p>
                        <Badge className={statusColor}>
                          {opportunity.status === 'won'
                            ? t('status.won')
                            : opportunity.status === 'lost'
                            ? t('status.lost')
                            : t('status.open')}
                        </Badge>
                      </div>
                      {organization && !isClosed && (
                        <TagSelector
                          entityType="opportunity"
                          entityId={opportunity.id}
                          organizationId={organization.id}
                        />
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-muted-foreground">{t('opportunities.contact')}</p>
                        {opportunity.contacts ? (
                          <Link 
                            to={`/contacts/${opportunity.contact_id}`}
                            className="text-lg font-semibold text-primary hover:underline"
                          >
                            {opportunity.contacts.full_name}
                          </Link>
                        ) : (
                          <p className="text-lg font-semibold">-</p>
                        )}
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">{t('opportunities.owner')}</p>
                        {isClosed ? (
                          <p className="text-lg font-semibold">{opportunity.users?.full_name || '-'}</p>
                        ) : (
                          <OwnerSelector
                            value={(opportunity as any).owner_user_id || null}
                            onChange={async (userId) => {
                              const { error } = await supabase
                                .from('opportunities')
                                .update({ owner_user_id: userId, updated_by: userProfile?.id || null } as any)
                                .eq('id', opportunity.id);
                              if (error) {
                                toast({ title: t('common.error'), variant: 'destructive' });
                              } else {
                                fetchOpportunity();
                                toast({ title: t('opportunities.updated') });
                              }
                            }}
                            size="sm"
                          />
                        )}
                      </div>
                      {(opportunity as any).created_at && (
                        <div>
                          <p className="text-sm text-muted-foreground">Criado em</p>
                          <p className="text-lg font-semibold">
                            {new Date((opportunity as any).created_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                      {(opportunity as any).updated_at && (
                        <div>
                          <p className="text-sm text-muted-foreground">Atualizado em</p>
                          <p className="text-lg font-semibold">
                            {new Date((opportunity as any).updated_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                      )}
                      <div>
                        <p className="text-sm text-muted-foreground">Criado por</p>
                        <p className="text-lg font-semibold">{createdByName || 'Sistema'}</p>
                      </div>
                      <div>
                        <p className="text-sm text-muted-foreground">Atualizado por</p>
                        <p className="text-lg font-semibold">{updatedByName || 'Sistema'}</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </Tabs.Panel>

            <Tabs.Panel id="timeline">
              <ActivityTimeline opportunityId={opportunity.id} />
            </Tabs.Panel>

            <Tabs.Panel id="calls">
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
            </Tabs.Panel>

            <Tabs.Panel id="messages">
              <ContactMessages opportunityId={opportunity.id} />
            </Tabs.Panel>

            <Tabs.Panel id="tasks">
              <ContactTasks opportunityId={opportunity.id} />
            </Tabs.Panel>

            <Tabs.Panel id="attachments">
              <ContactAttachments entityId={opportunity.id} entityType="opportunity" />
            </Tabs.Panel>

            <Tabs.Panel id="notes">
              <ContactNotes opportunityId={opportunity.id} />
            </Tabs.Panel>
          </Tabs>
        </div>
      </div>

      <OpportunityDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        opportunity={opportunity}
        stages={stages}
        onSuccess={fetchOpportunity}
        titleOnly={isClosed}
      />

      <CloseDatePromptDialog
        open={pendingStatus !== null}
        onOpenChange={(o) => !o && setPendingStatus(null)}
        title={pendingStatus === 'won' ? 'Marcar como Ganho' : 'Marcar como Perdido'}
        onConfirm={(date) => pendingStatus && applyStatusChange(pendingStatus, date)}
      />
    </Layout>
  );
}
