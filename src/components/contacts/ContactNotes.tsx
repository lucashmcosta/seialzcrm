import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Plus, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface Note {
  id: string;
  title: string;
  body: string | null;
  occurred_at: string;
  created_at: string;
}

interface ContactNotesProps {
  contactId?: string;
  opportunityId?: string;
}

export function ContactNotes({ contactId, opportunityId }: ContactNotesProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [notes, setNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteText, setNoteText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchNotes();
  }, [contactId, opportunityId, organization?.id]);

  const fetchNotes = async () => {
    if (!organization?.id) return;

    try {
      let query = supabase
        .from('activities')
        .select('id, title, body, occurred_at, created_at')
        .eq('organization_id', organization.id)
        .eq('activity_type', 'note')
        .is('deleted_at', null);

      if (contactId) {
        query = query.eq('contact_id', contactId);
      }
      if (opportunityId) {
        query = query.eq('opportunity_id', opportunityId);
      }

      const { data, error } = await query.order('occurred_at', { ascending: false });

      if (error) throw error;
      setNotes(data || []);
    } catch (error) {
      console.error('Error fetching notes:', error);
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
          opportunity_id: opportunityId,
          activity_type: 'note',
          title: t('activity.noteAdded'),
          body: noteText,
          created_by_user_id: userProfile.id,
          occurred_at: new Date().toISOString(),
        });

      if (error) throw error;

      toast({ description: t('activity.created') });
      setNoteText('');
      setShowNoteForm(false);
      fetchNotes();
    } catch (error) {
      console.error('Error adding note:', error);
      toast({ variant: 'destructive', description: t('common.error') });
    } finally {
      setSubmitting(false);
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
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{t('contacts.notesTab')}</CardTitle>
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
              placeholder={t('activity.notePlaceholder')}
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
          {notes.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">
              {t('activity.noNotes')}
            </p>
          ) : (
            notes.map((note) => (
              <div key={note.id} className="flex gap-4 pb-4 border-b last:border-0">
                <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                  <MessageSquare className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium text-foreground">{note.title}</p>
                    <span className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(note.occurred_at), {
                        addSuffix: true,
                        locale: dateLocale,
                      })}
                    </span>
                  </div>
                  {note.body && (
                    <p className="text-sm text-muted-foreground mt-1 whitespace-pre-wrap">
                      {note.body}
                    </p>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
