import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { usePermissions } from '@/hooks/usePermissions';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { ArrowLeft, Mail, Phone, Building2, Edit, Trash2 } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ActivityTimeline } from '@/components/contacts/ActivityTimeline';
import { ContactTasks } from '@/components/contacts/ContactTasks';
import { ContactCalls } from '@/components/contacts/ContactCalls';
import { ContactMessages } from '@/components/contacts/ContactMessages';
import { ContactAttachments } from '@/components/contacts/ContactAttachments';

export default function ContactDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { organization, locale, loading: orgLoading } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { permissions } = usePermissions();
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);

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

  const lifecycleColor = contact.lifecycle_stage === 'lead' ? 'bg-blue-500' : contact.lifecycle_stage === 'customer' ? 'bg-green-500' : 'bg-muted';

  return (
    <Layout>
      <div className="flex flex-col h-full">
        <div className="border-b bg-background/95 backdrop-blur">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-4">
              <Link to="/contacts">
                <Button variant="ghost" size="icon">
                  <ArrowLeft className="h-4 w-4" />
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-foreground">{contact.full_name}</h1>
                <Badge className={`${lifecycleColor} text-white`}>
                  {t(`lifecycle.${contact.lifecycle_stage}`)}
                </Badge>
              </div>
            </div>
            <div className="flex gap-2">
              {permissions.canEditContacts && (
                <Button variant="outline" asChild>
                  <Link to={`/contacts/${contact.id}/edit`}>
                    <Edit className="h-4 w-4 mr-2" />
                    {t('common.edit')}
                  </Link>
                </Button>
              )}
              {permissions.canDeleteContacts && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive">
                      <Trash2 className="h-4 w-4 mr-2" />
                      {t('common.delete')}
                    </Button>
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
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-auto p-6">
          <Tabs defaultValue="details" className="w-full">
            <TabsList>
              <TabsTrigger value="details">{t('contacts.details')}</TabsTrigger>
              <TabsTrigger value="timeline">{t('contacts.timeline')}</TabsTrigger>
              <TabsTrigger value="opportunities">{t('contacts.opportunitiesTab')}</TabsTrigger>
              <TabsTrigger value="tasks">{t('contacts.tasksTab')}</TabsTrigger>
            </TabsList>

            <TabsContent value="details" className="space-y-4">
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
                      <div>
                        <div className="text-sm text-muted-foreground">{t('contacts.phone')}</div>
                        <div className="text-foreground">{contact.phone}</div>
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
            </TabsContent>

            <TabsContent value="timeline" className="space-y-4">
              <ActivityTimeline contactId={contact.id} />
              <ContactCalls contactId={contact.id} />
              <ContactMessages contactId={contact.id} />
              <ContactAttachments contactId={contact.id} />
            </TabsContent>

            <TabsContent value="opportunities">
              <Card className="p-6">
                <p className="text-muted-foreground">{t('contacts.opportunitiesTab')} - Coming soon</p>
              </Card>
            </TabsContent>

            <TabsContent value="tasks">
              <ContactTasks contactId={contact.id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </Layout>
  );
}
