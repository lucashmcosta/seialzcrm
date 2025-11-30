import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, MessageSquare, Phone, CheckSquare, FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface Activity {
  id: string;
  activity_type: string;
  title: string;
  body: string | null;
  occurred_at: string;
  created_at: string;
}

interface ActivityTimelineProps {
  contactId?: string;
  opportunityId?: string;
}

export function ActivityTimeline({ contactId, opportunityId }: ActivityTimelineProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchActivities();
  }, [contactId, opportunityId, organization?.id]);

  const fetchActivities = async () => {
    if (!organization?.id) return;

    try {
      let query = supabase
        .from('activities')
        .select('*')
        .eq('organization_id', organization.id)
        .is('deleted_at', null);

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }
      if (opportunityId) {
        query = query.eq('opportunity_id', opportunityId);
      }

      const { data, error } = await query.order('occurred_at', { ascending: false });

      if (error) throw error;
      setActivities(data || []);
    } catch (error) {
      console.error('Error fetching activities:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleAddNote = async () => {
    if (!organization?.id || !userProfile?.id || !noteText.trim()) return;

    setSubmitting(true);
    try {
      const { error } = await supabase
        .from('activities')
        .insert({
          organization_id: organization.id,
          contact_id: contactId,
          activity_type: 'note',
          title: 'Note added',
          body: noteText,
          created_by_user_id: userProfile.id,
          occurred_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({ description: t('activity.created') });
      setNoteText('');
      setShowNoteForm(false);
      fetchActivities();
    } catch (error) {
      console.error('Error adding note:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    } finally {
      setSubmitting(false);
    }
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'note': return <MessageSquare className="w-4 h-4" />;
      case 'call': return <Phone className="w-4 h-4" />;
      case 'task': return <CheckSquare className="w-4 h-4" />;
      case 'message': return <MessageSquare className="w-4 h-4" />;
      default: return <FileText className="w-4 h-4" />;
    }
  };

  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>{t('activity.timeline')}</CardTitle>
            <Button onClick={() => setShowNoteForm(!showNoteForm)} size="sm">
              <Plus className="w-4 h-4 mr-2" />
              {t('activity.addNote')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showNoteForm && (
            <div className="mb-6 space-y-3">
              <Textarea
                placeholder="Add a note..."
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                rows={3}
              />
              <div className="flex gap-2">
                <Button onClick={handleAddNote} disabled={submitting} size="sm">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {t('common.save')}
                </Button>
                <Button variant="outline" onClick={() => setShowNoteForm(false)} size="sm">
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {activities.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No activities yet
              </p>
            ) : (
              activities.map((activity) => (
                <div key={activity.id} className="flex gap-4 pb-4 border-b last:border-0">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                    {getActivityIcon(activity.activity_type)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-foreground">{activity.title}</p>
                      <span className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(activity.occurred_at), {
                          addSuffix: true,
                          locale: dateLocale,
                        })}
                      </span>
                    </div>
                    {activity.body && (
                      <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                        {activity.body}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
