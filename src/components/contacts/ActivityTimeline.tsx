import { useState, useEffect } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { useTranslation } from '@/lib/i18n';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, MessageSquare, Phone, CheckSquare, FileText, PhoneOutgoing, PhoneIncoming, User, Clock } from 'lucide-react';
import { formatDistanceToNow, format } from 'date-fns';
import { ptBR, enUS } from 'date-fns/locale';
import { formatPhoneDisplay } from '@/lib/phoneUtils';

interface Activity {
  id: string;
  activity_type: string;
  title: string;
  body: string | null;
  occurred_at: string;
  created_at: string;
}

interface CallDetails {
  id: string;
  direction: string;
  status: string | null;
  duration_seconds: number | null;
  to_number: string | null;
  from_number: string | null;
  started_at: string | null;
  user: { full_name: string } | null;
}

interface ActivityTimelineProps {
  contactId?: string;
  opportunityId?: string;
}

export function ActivityTimeline({ contactId, opportunityId }: ActivityTimelineProps) {
  const { organization, locale } = useOrganization();
  const { t } = useTranslation(locale as any);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [calls, setCalls] = useState<CallDetails[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, [contactId, opportunityId, organization?.id]);

  const fetchData = async () => {
    if (!organization?.id) return;

    try {
      // Fetch activities
      let activityQuery = supabase
        .from('activities')
        .select('*')
        .eq('organization_id', organization.id)
        .is('deleted_at', null)
        .neq('activity_type', 'call'); // Exclude call activities, we'll fetch from calls table

      if (contactId) {
        activityQuery = activityQuery.eq('contact_id', contactId);
      }
      if (opportunityId) {
        activityQuery = activityQuery.eq('opportunity_id', opportunityId);
      }

      // Fetch calls with user info
      let callsQuery = supabase
        .from('calls')
        .select(`
          id,
          direction,
          status,
          duration_seconds,
          to_number,
          from_number,
          started_at,
          user:users!user_id(full_name)
        `)
        .eq('organization_id', organization.id)
        .is('deleted_at', null);

      if (contactId) {
        callsQuery = callsQuery.eq('contact_id', contactId);
      }
      if (opportunityId) {
        callsQuery = callsQuery.eq('opportunity_id', opportunityId);
      }

      const [activitiesResult, callsResult] = await Promise.all([
        activityQuery.order('occurred_at', { ascending: false }),
        callsQuery.order('started_at', { ascending: false })
      ]);

      if (activitiesResult.error) throw activitiesResult.error;
      if (callsResult.error) throw callsResult.error;

      setActivities(activitiesResult.data || []);
      setCalls(callsResult.data as CallDetails[] || []);
    } catch (error) {
      console.error('Error fetching data:', error);
    } finally {
      setLoading(false);
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

  const getCallStatusBadge = (status: string | null) => {
    const config: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      'completed': { label: 'Completada', variant: 'outline' },
      'in-progress': { label: 'Em andamento', variant: 'default' },
      'no-answer': { label: 'Não atendeu', variant: 'destructive' },
      'busy': { label: 'Ocupado', variant: 'destructive' },
      'canceled': { label: 'Cancelada', variant: 'secondary' },
      'failed': { label: 'Falhou', variant: 'destructive' },
      'queued': { label: 'Na fila', variant: 'secondary' },
      'ringing': { label: 'Chamando', variant: 'default' },
    };

    const statusConfig = config[status || 'completed'] || config['completed'];
    return (
      <Badge variant={statusConfig.variant} className="text-xs">
        {statusConfig.label}
      </Badge>
    );
  };

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return null;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins === 0) return `${secs}s`;
    return `${mins}min ${secs}s`;
  };

  const dateLocale = locale === 'pt-BR' ? ptBR : enUS;

  // Combine and sort activities and calls
  const combinedItems = [
    ...activities.map(a => ({
      type: 'activity' as const,
      data: a,
      timestamp: new Date(a.occurred_at || a.created_at).getTime()
    })),
    ...calls.map(c => ({
      type: 'call' as const,
      data: c,
      timestamp: new Date(c.started_at || '').getTime()
    }))
  ].sort((a, b) => b.timestamp - a.timestamp);

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
        <CardTitle>{t('activity.timeline')}</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
            {combinedItems.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                No activities yet
              </p>
            ) : (
              combinedItems.map((item) => {
                if (item.type === 'call') {
                  const call = item.data as CallDetails;
                  const isOutgoing = call.direction === 'outgoing';
                  const phoneNumber = isOutgoing ? call.to_number : call.from_number;

                  return (
                    <div key={`call-${call.id}`} className="flex gap-4 pb-4 border-b last:border-0">
                      <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center bg-orange-500/10 text-orange-600">
                        {isOutgoing ? <PhoneOutgoing className="w-4 h-4" /> : <PhoneIncoming className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="font-medium text-foreground">
                              {isOutgoing ? 'Ligação realizada' : 'Ligação recebida'}
                            </p>
                            {getCallStatusBadge(call.status)}
                          </div>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {call.started_at && formatDistanceToNow(new Date(call.started_at), {
                              addSuffix: true,
                              locale: dateLocale,
                            })}
                          </span>
                        </div>
                        
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1 text-sm text-muted-foreground">
                          {phoneNumber && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3" />
                              {formatPhoneDisplay(phoneNumber)}
                            </span>
                          )}
                          {call.duration_seconds !== null && call.duration_seconds > 0 && (
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {formatDuration(call.duration_seconds)}
                            </span>
                          )}
                          {call.user?.full_name && (
                            <span className="flex items-center gap-1">
                              <User className="w-3 h-3" />
                              {call.user.full_name}
                            </span>
                          )}
                          {call.started_at && (
                            <span className="text-xs">
                              {format(new Date(call.started_at), 'HH:mm', { locale: dateLocale })}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                }

                // Regular activity
                const activity = item.data as Activity;
                return (
                  <div key={`activity-${activity.id}`} className="flex gap-4 pb-4 border-b last:border-0">
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
                );
              })
            )}
          </div>
        </CardContent>
      </Card>
  );
}
