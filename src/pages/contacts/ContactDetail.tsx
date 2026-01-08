import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import type { Key } from 'react-aria-components';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { useVoiceIntegration } from '@/hooks/useVoiceIntegration';
import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { formatPhoneDisplay } from '@/lib/phoneUtils';
import { Card } from '@/components/ui/card';
import { toast } from 'sonner';
import { Mail, Phone, Building2 } from 'lucide-react';
import { Breadcrumbs } from '@/components/application/breadcrumbs/breadcrumbs';
import { Tabs } from '@/components/application/tabs/tabs';
import { NativeSelect } from '@/components/base/select/select-native';
import { ActivityTimeline } from '@/components/contacts/ActivityTimeline';
import { ContactTasks } from '@/components/contacts/ContactTasks';
import { ContactCalls } from '@/components/contacts/ContactCalls';
import { ContactMessages } from '@/components/contacts/ContactMessages';
import { ContactAttachments } from '@/components/contacts/ContactAttachments';
import { ContactOpportunities } from '@/components/contacts/ContactOpportunities';
import { ContactNotes } from '@/components/contacts/ContactNotes';

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization, locale, loading: orgLoading } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { permissions } = usePermissions();
  const { hasVoiceIntegration } = useVoiceIntegration();
  const { startCall } = useOutboundCall();
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedTab, setSelectedTab] = useState<Key>("details");

  const tabs = [
    { id: "details", label: t('contacts.details') },
    { id: "timeline", label: t('contacts.timeline') },
    { id: "opportunities", label: t('contacts.opportunitiesTab') },
    { id: "tasks", label: t('contacts.tasksTab') },
    { id: "notes", label: t('contacts.notesTab') },
    { id: "calls", label: t('contacts.callsTab') },
    { id: "messages", label: t('contacts.messagesTab') },
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

  if (orgLoading || loading) return <Layout><div className="p-6">{t('common.loading')}</div></Layout>;
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
                      <Mail className="h-4 w-4 text-muted-foreground" />
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
                      <Building2 className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-muted-foreground">{t('contacts.company')}</div>
                        <div className="text-foreground">{contact.company_name}</div>
                      </div>
                    </div>
                  )}
                </div>
              </Card>
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

            <Tabs.Panel id="messages">
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
