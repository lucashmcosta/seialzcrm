import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Send, MessageSquare } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';

interface Message {
  id: string;
  content: string;
  direction: string;
  sent_at: string;
  created_at: string;
}

interface ContactMessagesProps {
  contactId: string;
}

export function ContactMessages({ contactId }: ContactMessagesProps) {
  const { organization, locale, userProfile } = useOrganization();
  const { t } = useTranslation(locale as any);
  const { toast } = useToast();
  const [messages, setMessages] = useState<Message[]>([]);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [messageText, setMessageText] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchThread();
  }, [contactId, organization?.id]);

  const fetchThread = async () => {
    if (!organization?.id) return;

    try {
      // Check if thread exists
      const { data: threadData } = await supabase
        .from('message_threads')
        .select('id')
        .eq('organization_id', organization.id)
        .eq('contact_id', contactId)
        .eq('channel', 'internal')
        .maybeSingle();

      if (threadData) {
        setThreadId(threadData.id);
        fetchMessages(threadData.id);
      } else {
        setLoading(false);
      }
    } catch (error) {
      console.error('Error fetching thread:', error);
      setLoading(false);
    }
  };

  const fetchMessages = async (thread: string) => {
    try {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('thread_id', thread)
        .is('deleted_at', null)
        .order('sent_at', { ascending: true });

      if (error) throw error;
      setMessages(data || []);
    } catch (error) {
      console.error('Error fetching messages:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!organization?.id || !userProfile?.id || !messageText.trim()) return;

    setSubmitting(true);
    try {
      let currentThreadId = threadId;

      // Create thread if doesn't exist
      if (!currentThreadId) {
        const { data: newThread, error: threadError } = await supabase
          .from('message_threads')
          .insert({
            organization_id: organization.id,
            contact_id: contactId,
            channel: 'internal',
          })
          .select()
          .single();

        if (threadError) throw threadError;
        currentThreadId = newThread.id;
        setThreadId(currentThreadId);
      }

      // Insert message
      const { error } = await supabase
        .from('messages')
        .insert({
          organization_id: organization.id,
          thread_id: currentThreadId,
          sender_user_id: userProfile.id,
          content: messageText,
          direction: 'internal',
          sent_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Create activity
      await supabase.from('activities').insert({
        organization_id: organization.id,
        contact_id: contactId,
        activity_type: 'message',
        title: 'Message sent',
        body: messageText,
        created_by_user_id: userProfile.id,
        occurred_at: new Date().toISOString(),
      });

      setMessageText('');
      fetchMessages(currentThreadId);
    } catch (error) {
      console.error('Error sending message:', error);
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
        <CardTitle>Messages</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          <div className="space-y-3 min-h-[200px] max-h-[400px] overflow-y-auto">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <MessageSquare className="w-12 h-12 mb-2 opacity-20" />
                <p>No messages yet</p>
              </div>
            ) : (
              messages.map((message) => (
                <div key={message.id} className="flex gap-3">
                  <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-sm font-semibold">
                    {userProfile?.full_name?.charAt(0) || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="bg-muted rounded-lg p-3">
                      <p className="text-sm text-foreground whitespace-pre-wrap">{message.content}</p>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(message.sent_at), { addSuffix: true, locale: dateLocale })}
                    </p>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="flex gap-2">
            <Textarea
              placeholder="Type a message..."
              value={messageText}
              onChange={(e) => setMessageText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              rows={2}
              className="flex-1"
            />
            <Button onClick={handleSendMessage} disabled={submitting || !messageText.trim()}>
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
