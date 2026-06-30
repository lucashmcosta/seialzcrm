import { useEffect, useState } from 'react';
import { Layout } from '@/components/Layout';
import { useIsMobile } from '@/hooks/use-mobile';
import { useAuth } from '@/hooks/useAuth';
import { useOrganizationContext } from '@/contexts/OrganizationContext';
import { supabase } from '@/integrations/supabase/client';

import { MobileInbox } from '@/components/mobile/MobileInbox';
import { InboxThreadList } from '@/components/inbox/InboxThreadList';
import { InboxThreadDetail } from '@/components/inbox/InboxThreadDetail';
import { InboxMetricsBar } from '@/components/inbox/InboxMetricsBar';
import { useInboxQueueCounts } from '@/hooks/inbox/useInboxQueueCounts';
import { useInboxThreads } from '@/hooks/inbox/useInboxThreads';
import type { InboxTab } from '@/hooks/inbox/inboxScope';

export default function InboxPage() {
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const { organization } = useOrganizationContext();
  const [internalUserId, setInternalUserId] = useState<string | null>(null);
  const [tab, setTab] = useState<InboxTab>('active');
  const [onlyMine, setOnlyMine] = useState(false);
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

  const orgTimezone = organization?.timezone ?? null;
  const organizationId = organization?.id ?? null;
  const csIncludesServiceEndpoints = organization?.cs_inbox_includes_service_endpoints ?? false;
  const { counts, refreshDebounced: refreshCounts } = useInboxQueueCounts(internalUserId, onlyMine, orgTimezone, csIncludesServiceEndpoints);
  const { threads, loading, refresh: refreshThreads } = useInboxThreads(tab, onlyMine, internalUserId, orgTimezone, organizationId, csIncludesServiceEndpoints);

  // Mobile uses dedicated MobileInbox (lista + chat fullscreen, padrão /messages)
  if (isMobile) {
    return <MobileInbox />;
  }

  return (
    <Layout>
      <div className="h-full flex flex-col min-h-0">
        <InboxMetricsBar
          counts={counts}
          active={tab}
          onChange={(t) => { setTab(t); setSelectedId(null); }}
          onlyMine={onlyMine}
          onOnlyMineChange={(v) => { setOnlyMine(v); setSelectedId(null); }}
        />
        <div className="flex-1 flex min-h-0 overflow-hidden">
          <InboxThreadList
            threads={threads}
            loading={loading}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <InboxThreadDetail
            threadId={selectedId}
            onThreadStatusChanged={() => { refreshCounts(); refreshThreads(); }}
          />
        </div>
      </div>
    </Layout>
  );
}
