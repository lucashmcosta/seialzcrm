import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { InboxQueues } from '@/components/inbox/InboxQueues';
import { InboxThreadList } from '@/components/inbox/InboxThreadList';
import { InboxThreadDetail } from '@/components/inbox/InboxThreadDetail';
import { InboxMetricsBar } from '@/components/inbox/InboxMetricsBar';
import { useInboxQueueCounts, type InboxQueue } from '@/hooks/inbox/useInboxQueueCounts';
import { useInboxThreads } from '@/hooks/inbox/useInboxThreads';
import { Headset } from '@phosphor-icons/react';

export default function InboxPage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [queue, setQueue] = useState<InboxQueue>('mine');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Resolve internal users.id from auth.uid (Core rule: relational tables use users.id)
  useEffect(() => {
    let cancelled = false;
    if (!user?.id) { setInternalUserId(null); return; }
    (async () => {
      const { data } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle();
      if (!cancelled) setInternalUserId((data?.id as string) ?? null);
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  const { counts } = useInboxQueueCounts(internalUserId);
  const { threads, loading } = useInboxThreads(queue, internalUserId);

  // Mobile placeholder — does NOT redirect to /messages
  if (isMobile) {
    return (
      <Layout>
        <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
          <Headset size={48} weight="light" className="text-muted-foreground" />
          <h1 className="text-lg font-semibold text-foreground">Atendimento</h1>
          <p className="text-sm text-muted-foreground max-w-xs">
            Atendimento mobile em breve. Use desktop por enquanto.
          </p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="h-full flex flex-col min-h-0">
        <InboxMetricsBar counts={counts} />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <InboxQueues
            active={queue}
            counts={counts}
            onChange={(q) => { setQueue(q); setSelectedId(null); }}
          />
          <InboxThreadList
            threads={threads}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <InboxThreadDetail threadId={selectedId} />
        </div>
      </div>
    </Layout>
  );
}
