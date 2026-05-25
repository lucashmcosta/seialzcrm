import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import type { Key } from 'react-aria-components';
import { Layout } from '@/components/Layout';
import { MobileLayout } from '@/components/mobile/MobileLayout';
import { Skeleton } from '@/components/ui/skeleton';
import { MobileSpinner } from '@/components/mobile/MobileSpinner';
import { useIsMobile } from '@/hooks/use-mobile';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { useVoiceIntegration } from '@/hooks/useVoiceIntegration';
import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { EnvelopeSimple, Phone, Buildings, PencilSimple, TrashSimple, DotsThreeVertical, DotsThree, ChatCircle, User, UserPlus, FileText, MapPin, Calendar, Megaphone, ArrowSquareOut, CaretLeft, Archive, ArrowsLeftRight } from '@phosphor-icons/react';
import { Breadcrumbs } from '@/components/application/breadcrumbs/breadcrumbs';
import { Tabs } from '@/components/application/tabs/tabs';
import { NativeSelect } from '@/components/base/select/select-native';
import { Avatar } from '@/components/base/avatar/avatar';
import { Badge } from '@/components/base/badges/badges';
import { Button } from '@/components/base/buttons/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Drawer,
  DrawerContent,
  DrawerTrigger,
} from '@/components/ui/drawer';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { OwnerSelector } from '@/components/common/OwnerSelector';

import { ActivityTimeline } from '@/components/contacts/ActivityTimeline';
import { ContactTasks } from '@/components/contacts/ContactTasks';
import { ContactCalls } from '@/components/contacts/ContactCalls';
import { ContactMessages } from '@/components/contacts/ContactMessages';
import { ContactAttachments } from '@/components/contacts/ContactAttachments';
import { ContactOpportunities } from '@/components/contacts/ContactOpportunities';
import { ContactNotes } from '@/components/contacts/ContactNotes';

const getLifecycleColor = (stage: string | null): "gray" | "blue" | "purple" | "success" | "error" => {
  switch (stage) {
    case 'lead': return 'blue';
    case 'prospect': return 'purple';
    case 'customer': return 'success';
    case 'churned': return 'error';
    default: return 'gray';
  }
};

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { organization, locale, loading: orgLoading, userProfile } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { permissions } = usePermissions();
  const { hasVoiceIntegration } = useVoiceIntegration();
  const { startCall } = useOutboundCall();
  const [contact, setContact] = useState<any>(null);
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<Key>("details");
  const [createdByName, setCreatedByName] = useState<string | null>(null);
  const [updatedByName, setUpdatedByName] = useState<string | null>(null);
  const [maisOpen, setMaisOpen] = useState(false);

  const tabs = [
    { id: "details", label: isMobile ? 'Resumo' : t('contacts.details') },
    { id: "timeline", label: t('contacts.timeline') },
    { id: "opportunities", label: t('contacts.opportunitiesTab') },
    { id: "tasks", label: t('contacts.tasksTab') },
    { id: "notes", label: t('contacts.notesTab') },
    { id: "calls", label: t('contacts.callsTab') },
    ...(!isMobile ? [{ id: "messages", label: t('contacts.messagesTab') }] : []),
    { id: "attachments", label: t('contacts.attachmentsTab') },
  ];

  useEffect(() => {
    if (organization?.id) {
      fetchContact();
    }
  }, [id, organization?.id]);

  const fetchContact = async () => {
    if (!organization || !id) return;

    const { data, error } = await supabase
      .from('contacts')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organization.id)
      .maybeSingle();

    if (error) {
      toast.error(t('common.error'));
      return;
    }

    setContact(data);

    // Fetch linked marketing campaign for origin badge
    if (data?.marketing_campaign_id) {
      const { data: mc } = await supabase
        .from('marketing_campaigns')
        .select('id, display_name, ad_name, adset_name, campaign_name')
        .eq('id', data.marketing_campaign_id)
        .maybeSingle();
      setCampaign(mc);
    } else {
      setCampaign(null);
    }

    // Fetch created_by / updated_by names
    const byIds = [data?.created_by, data?.updated_by].filter(Boolean) as string[];
    if (byIds.length > 0) {
      const { data: users } = await supabase
        .from('users')
        .select('id, full_name')
        .in('id', byIds);
      const map = new Map((users || []).map((u: any) => [u.id, u.full_name]));
      setCreatedByName(data?.created_by ? map.get(data.created_by) || 'Sistema' : null);
      setUpdatedByName(data?.updated_by ? map.get(data.updated_by) || 'Sistema' : null);
    } else {
      setCreatedByName(null);
      setUpdatedByName(null);
    }

    setLoading(false);
  };

  const handleDelete = async () => {
    if (!contact) return;

    const { error } = await supabase
      .from('contacts')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', contact.id);

    if (error) {
      toast.error(t('common.error'));
      return;
    }

    toast.success(t('contacts.deleted'));
    navigate('/contacts');
  };

  // ── Mobile tab content renderer ──
  const renderTabContent = () => {
    switch (selectedTab) {
      case 'details':
        return (
          <div className="space-y-5 pt-4">
            {/* Contato */}
            <div className="bg-white/[0.04] rounded-[10px] p-4">
              <div className="text-[12px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">Contato</div>
              <div className="space-y-3">
                {contact?.email && (
                  <div className="flex items-center gap-3">
                    <EnvelopeSimple className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-muted-foreground/35">{t('contacts.email')}</div>
                      <a href={`mailto:${contact.email}`} className="text-[14px] text-primary">{contact.email}</a>
                    </div>
                  </div>
                )}
                {contact?.phone && (
                  <div className="flex items-center gap-3">
                    <Phone className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-muted-foreground/35">{t('contacts.phone')}</div>
                      <div className="text-[14px]">{formatPhoneDisplay(contact.phone)}</div>
                    </div>
                  </div>
                )}
                {contact?.company_name && (
                  <div className="flex items-center gap-3">
                    <Buildings className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                    <div>
                      <div className="text-[11px] text-muted-foreground/35">{t('contacts.company')}</div>
                      <div className="text-[14px]">{contact.company_name}</div>
                    </div>
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <User className="w-4 h-4 text-muted-foreground/40 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[11px] text-muted-foreground/35">{t('contacts.owner') || 'Responsável'}</div>
                    {contact?.owner_user_id ? (
                      <OwnerSelector
                        value={contact?.owner_user_id}
                        onChange={async (userId) => {
                          const { error } = await supabase
                            .from('contacts')
                            .update({ owner_user_id: userId, updated_by: userProfile?.id || null } as any)
                            .eq('id', contact.id);
                          if (error) {
                            toast.error(t('common.error'));
                          } else {
                            setContact({ ...contact, owner_user_id: userId });
                            toast.success(t('contacts.updated'));
                          }
                        }}
                        size="sm"
                      />
                    ) : (
                      <div className="text-[14px] text-muted-foreground/50">Sem responsável</div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Documentos */}
            <div className="bg-white/[0.04] rounded-[10px] p-4">
              <div className="text-[12px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">Documentos</div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-[11px] text-muted-foreground/40">CPF</div>
                  <div className="text-[14px]">{contact?.cpf || '—'}</div>
                </div>
                <div>
                  <div className="text-[11px] text-muted-foreground/40">RG</div>
                  <div className="text-[14px]">{contact?.rg ? `${contact.rg}${contact.rg_issuer ? ` - ${contact.rg_issuer}` : ''}` : '—'}</div>
                </div>
              </div>
            </div>

            {/* Endereço */}
            <div className="bg-white/[0.04] rounded-[10px] p-4">
              <div className="text-[12px] font-medium text-muted-foreground/50 uppercase tracking-wider mb-3">Endereço</div>
              <div className="flex items-start gap-3">
                <MapPin className="w-4 h-4 text-muted-foreground/40 mt-0.5 flex-shrink-0" />
                <div className="text-[14px]">
                  {contact?.address_street || contact?.address_city ? (
                    <>
                      {contact.address_street && <div>{contact.address_street}</div>}
                      {contact.address_neighborhood && <div>{contact.address_neighborhood}</div>}
                      <div>
                        {[contact.address_city, contact.address_state].filter(Boolean).join(' - ')}
                        {contact.address_zip && ` · CEP ${contact.address_zip}`}
                      </div>
                    </>
                  ) : '—'}
                </div>
              </div>
            </div>
          </div>
        );
      case 'timeline': return <ActivityTimeline contactId={contact!.id} />;
      case 'opportunities': return <ContactOpportunities contactId={contact!.id} />;
      case 'tasks': return <ContactTasks contactId={contact!.id} />;
      case 'notes': return <ContactNotes contactId={contact!.id} />;
      case 'calls': return <ContactCalls contactId={contact!.id} contactPhone={contact?.phone} contactName={contact?.full_name} />;
      case 'messages': return <ContactMessages contactId={contact!.id} />;
      case 'attachments': return <ContactAttachments contactId={contact!.id} />;
      default: return null;
    }
  };

  // ── Mobile ──
  if (isMobile) {
    if (orgLoading || loading) {
      return (
        <MobileLayout>
          <div className="flex items-center justify-center h-full">
            <MobileSpinner />
          </div>
        </MobileLayout>
      );
    }
    if (!contact) {
      return (
        <MobileLayout>
          <div className="p-4 text-center text-muted-foreground">{t('common.noResults')}</div>
        </MobileLayout>
      );
    }
    return (
      <MobileLayout>
        <div className="flex flex-col h-full">
          {/* Back button */}
          <div className="px-4 pt-3 pb-1">
            <button
              onClick={() => navigate('/contacts')}
              className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <CaretLeft size={16} weight="bold" />
              {t('contacts.title')}
            </button>
          </div>

          {/* Avatar + Name header */}
          <div className="flex flex-col items-center px-4 pt-2 pb-4 gap-2">
            <Avatar fallbackText={contact.full_name} size="xl" />
            <div className="flex items-center gap-2 flex-wrap justify-center">
              <h1 className="text-lg font-semibold text-foreground">{contact.full_name}</h1>
              {contact.lifecycle_stage && (
                <Badge color={getLifecycleColor(contact.lifecycle_stage)} size="sm">
                  {contact.lifecycle_stage}
                </Badge>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center justify-center gap-2 px-4 pb-4">
            <Button color="secondary" size="sm" onClick={() => navigate(`/messages?contact=${contact.id}`)}>
              <ChatCircle className="h-4 w-4 mr-1.5" />
              Mensagens
            </Button>
            {hasVoiceIntegration && contact.phone && (
              <Button color="secondary" size="sm" onClick={() => startCall({ phoneNumber: contact.phone, contactId: contact.id, contactName: contact.full_name })}>
                <Phone className="h-4 w-4 mr-1.5" />
                Ligar
              </Button>
            )}
            {contact.email && (
              <Button color="secondary" size="sm" asChild>
                <a href={`mailto:${contact.email}`}>
                  <EnvelopeSimple className="h-4 w-4 mr-1.5" />
                  Email
                </a>
              </Button>
            )}
            <Drawer open={maisOpen} onOpenChange={setMaisOpen}>
              <DrawerTrigger asChild>
                <Button color="secondary" size="sm">
                  <DotsThree className="h-4 w-4" />
                </Button>
              </DrawerTrigger>
              <DrawerContent className="pb-8">
                <div className="pt-3 pb-2">
                  <div className="w-9 h-1 rounded-full bg-muted-foreground/20 mx-auto mb-4" />
                  <div className="flex flex-col">
                    {permissions.canEditContacts && (
                      <button
                        onClick={() => { setMaisOpen(false); navigate(`/contacts/${contact.id}/edit`); }}
                        className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-foreground active:bg-white/[0.04]"
                      >
                        <PencilSimple className="w-5 h-5 text-muted-foreground/50" />
                        Editar contato
                      </button>
                    )}
                    <button
                      onClick={() => { setMaisOpen(false); }}
                      className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-foreground active:bg-white/[0.04]"
                    >
                      <UserPlus className="w-5 h-5 text-muted-foreground/50" />
                      Atribuir responsável
                    </button>
                    <button
                      onClick={() => { setMaisOpen(false); }}
                      className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-foreground active:bg-white/[0.04]"
                    >
                      <ArrowsLeftRight className="w-5 h-5 text-muted-foreground/50" />
                      Mover para cliente
                    </button>
                    <button
                      onClick={() => { setMaisOpen(false); }}
                      className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-foreground active:bg-white/[0.04]"
                    >
                      <Archive className="w-5 h-5 text-muted-foreground/50" />
                      Arquivar contato
                    </button>

                    <div className="border-t border-white/[0.08] my-1" />

                    {permissions.canDeleteContacts && (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <button className="flex items-center gap-3.5 px-5 py-3.5 text-[15px] text-destructive active:bg-white/[0.04]">
                            <TrashSimple className="w-5 h-5" />
                            Excluir contato
                          </button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>{t('contacts.deleteConfirm')}</AlertDialogTitle>
                            <AlertDialogDescription>{contact.full_name}</AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>{t('common.cancel')}</AlertDialogCancel>
                            <AlertDialogAction onClick={() => { setMaisOpen(false); handleDelete(); }}>{t('common.delete')}</AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </div>
              </DrawerContent>
            </Drawer>
          </div>

          {/* Horizontal scrollable tabs */}
          <div className="flex overflow-x-auto border-b border-border px-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setSelectedTab(tab.id)}
                className={`px-3.5 py-2.5 text-[13px] whitespace-nowrap border-b-2 transition-colors ${
                  selectedTab === tab.id
                    ? 'text-primary border-primary font-medium'
                    : 'text-muted-foreground border-transparent hover:text-foreground'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          <div className="flex-1 overflow-auto px-4 pb-4 [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {renderTabContent()}
          </div>
        </div>
      </MobileLayout>
    );
  }

  // ── Desktop ──
  if (orgLoading || loading) return (
    <Layout>
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-16 w-16 rounded-full" />
          <div className="space-y-2">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 space-y-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-4 w-36" />
              </div>
            ))}
          </div>
          <div className="lg:col-span-2">
            <Skeleton className="h-64 w-full rounded-lg" />
          </div>
        </div>
      </div>
    </Layout>
  );
  if (!contact) return <Layout><div className="p-6">{t('common.noResults')}</div></Layout>;

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="px-6 pt-4">
          <Breadcrumbs 
            items={[
              { label: t('contacts.title'), href: '/contacts' },
              { label: contact.full_name }
            ]} 
          />

          {/* Card Header com Avatar */}
          <div className="mt-6 flex items-start justify-between">
            <div className="flex items-start gap-4">
              <Avatar 
                fallbackText={contact.full_name}
                size="xl"
              />
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold text-foreground">
                    {contact.full_name}
                  </h1>
                  {contact.lifecycle_stage && (
                    <Badge color={getLifecycleColor(contact.lifecycle_stage)} size="sm">
                      {contact.lifecycle_stage}
                    </Badge>
                  )}
                </div>
                {contact.email && (
                  <p className="text-sm text-muted-foreground">{contact.email}</p>
                )}
              </div>
            </div>

            <div className="flex items-center gap-2">
              
              {permissions.canEditContacts && (
                <Button color="secondary" size="sm" asChild>
                  <Link to={`/contacts/${contact.id}/edit`}>
                    <PencilSimple className="h-4 w-4 mr-2" />
                    {t('common.edit')}
                  </Link>
                </Button>
              )}
              
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button color="ghost" size="icon">
                    <DotsThreeVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {permissions.canEditContacts && (
                    <DropdownMenuItem asChild>
                      <Link to={`/contacts/${contact.id}/edit`}>
                        <PencilSimple className="h-4 w-4 mr-2" />
                        {t('common.edit')}
                      </Link>
                    </DropdownMenuItem>
                  )}
                  {permissions.canDeleteContacts && (
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <DropdownMenuItem 
                          className="text-destructive focus:text-destructive"
                          onSelect={(e) => e.preventDefault()}
                        >
                          <TrashSimple className="h-4 w-4 mr-2" />
                          {t('common.delete')}
                        </DropdownMenuItem>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t('contacts.deleteConfirm')}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {contact.full_name}
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
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
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
          <Tabs selectedKey={selectedTab} onSelectionChange={setSelectedTab} className="w-full">
            <Tabs.List type="underline" items={tabs} className="max-md:hidden">
              {(tab) => <Tabs.Item key={tab.id} {...tab} />}
            </Tabs.List>

            <Tabs.Panel id="details" className="space-y-4">
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-foreground">{t('contacts.details')}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {contact.email && (
                    <div className="flex items-center gap-3">
                      <EnvelopeSimple className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">{t('contacts.email')}</div>
                        <div className="text-foreground">{contact.email}</div>
                      </div>
                    </div>
                  )}
                  {contact.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="h-4 w-4 text-muted-foreground" />
                      <div className="flex-1">
                        <div className="text-sm text-muted-foreground">{t('contacts.phone')}</div>
                        <div className="flex items-center gap-2">
                          {hasVoiceIntegration ? (
                            <button
                              onClick={() => startCall({ 
                                phoneNumber: contact.phone, 
                                contactName: contact.full_name, 
                                contactId: contact.id 
                              })}
                              className="text-primary hover:underline cursor-pointer font-medium"
                            >
                              {formatPhoneDisplay(contact.phone)}
                            </button>
                          ) : (
                            <span className="text-foreground">{formatPhoneDisplay(contact.phone)}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                  {contact.company_name && (
                    <div className="flex items-center gap-3">
                      <Buildings className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">{t('contacts.company')}</div>
                        <div className="text-foreground">{contact.company_name}</div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div className="flex-1">
                      <div className="text-sm text-muted-foreground">{t('contacts.owner') || 'Responsável'}</div>
                      <OwnerSelector
                        value={contact.owner_user_id}
                        onChange={async (userId) => {
                          const { error } = await supabase
                            .from('contacts')
                            .update({ owner_user_id: userId, updated_by: userProfile?.id || null } as any)
                            .eq('id', contact.id);
                          if (error) {
                            toast.error(t('common.error'));
                          } else {
                            setContact({ ...contact, owner_user_id: userId });
                            toast.success(t('contacts.updated'));
                          }
                        }}
                        size="sm"
                      />
                    </div>
                  </div>
                  {contact.created_at && (
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Criado em</div>
                        <div className="text-foreground">
                          {new Date(contact.created_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )}
                  {contact.updated_at && (
                    <div className="flex items-center gap-3">
                      <Calendar className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">Atualizado em</div>
                        <div className="text-foreground">
                          {new Date(contact.updated_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    </div>
                  )}
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Criado por</div>
                      <div className="text-foreground">{createdByName || 'Sistema'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Atualizado por</div>
                      <div className="text-foreground">{updatedByName || 'Sistema'}</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Documentos */}
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-foreground">Documentos</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">CPF</div>
                      <div className="text-foreground">{contact.cpf || '—'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">RG</div>
                      <div className="text-foreground">
                        {contact.rg ? `${contact.rg}${contact.rg_issuer ? ` - ${contact.rg_issuer}` : ''}` : '—'}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <div className="text-sm text-muted-foreground">Nacionalidade</div>
                      <div className="text-foreground">{contact.nationality || '—'}</div>
                    </div>
                  </div>
                </div>
              </Card>

              {/* Endereço */}
              <Card className="p-6">
                <h2 className="text-lg font-semibold mb-4 text-foreground">Endereço</h2>
                <div className="flex items-start gap-3">
                  <MapPin className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <div className="text-foreground">
                    {contact.address_street || contact.address_city ? (
                      <>
                        {contact.address_street && <div>{contact.address_street}</div>}
                        {contact.address_neighborhood && <div>{contact.address_neighborhood}</div>}
                        <div>
                          {[contact.address_city, contact.address_state].filter(Boolean).join(' - ')}
                          {contact.address_zip && ` · CEP ${contact.address_zip}`}
                        </div>
                      </>
                    ) : '—'}
                  </div>
                </div>
              </Card>

              {/* Origem do Anúncio (CTWA) */}
              {contact.ad_referral_source_id && (
                <Card className="p-6">
                  <div className="flex items-center gap-2 mb-4">
                    <Megaphone className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold text-foreground">Origem do Anúncio</h2>
                    <Badge color="blue" size="sm">CTWA</Badge>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {contact.ad_referral_headline && (
                      <div>
                        <div className="text-sm text-muted-foreground">Título do Anúncio</div>
                        <div className="text-foreground font-medium">{contact.ad_referral_headline}</div>
                      </div>
                    )}
                    {contact.ad_referral_body && (
                      <div>
                        <div className="text-sm text-muted-foreground">Texto do Anúncio</div>
                        <div className="text-foreground">{contact.ad_referral_body}</div>
                      </div>
                    )}
                    {contact.ad_referral_source_id && (
                      <div>
                        <div className="text-sm text-muted-foreground">Ad ID (Meta)</div>
                        <div className="text-foreground font-mono text-sm">{contact.ad_referral_source_id}</div>
                      </div>
                    )}
                    {contact.ad_referral_source_url && (
                      <div>
                        <div className="text-sm text-muted-foreground">Link do Anúncio</div>
                        <a 
                          href={contact.ad_referral_source_url} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline inline-flex items-center gap-1 text-sm"
                        >
                          Abrir anúncio <ArrowSquareOut className="h-3 w-3" />
                        </a>
                      </div>
                    )}
                    {contact.ad_referral_captured_at && (
                      <div>
                        <div className="text-sm text-muted-foreground">Capturado em</div>
                        <div className="text-foreground">
                          {new Date(contact.ad_referral_captured_at).toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                    )}
                  </div>
                  {contact.ad_referral_media_url && (
                    <div className="mt-4">
                      <div className="text-sm text-muted-foreground mb-2">Imagem do Anúncio</div>
                      <img 
                        src={contact.ad_referral_media_url} 
                        alt="Anúncio" 
                        className="rounded-lg max-w-xs max-h-48 object-cover border border-border"
                      />
                    </div>
                  )}
                </Card>
              )}
            </Tabs.Panel>

            <Tabs.Panel id="timeline">
              <ActivityTimeline contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="opportunities">
              <ContactOpportunities contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="tasks">
              <ContactTasks contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="notes">
              <ContactNotes contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="calls">
              <ContactCalls 
                contactId={contact.id} 
                contactPhone={contact.phone}
                contactName={contact.full_name}
              />
            </Tabs.Panel>

            <Tabs.Panel id="messages" className="flex-1 min-h-0">
              <ContactMessages contactId={contact.id} />
            </Tabs.Panel>

            <Tabs.Panel id="attachments">
              <ContactAttachments contactId={contact.id} />
            </Tabs.Panel>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
