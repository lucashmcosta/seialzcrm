import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams, Navigate, Link } from 'react-router-dom';
import { zeroConversationUnread } from '@/lib/clientPortalUnread';
import { PORTAL_MENU_UNREAD_KEY } from '@/hooks/useClientPortalUnreadCount';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Paperclip, PaperPlaneRight, CheckCircle, ArrowCounterClockwise, UserCirclePlus, Info, FilePdf, SpinnerGap } from '@phosphor-icons/react';
import { Layout } from '@/components/Layout';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { useOrganization } from '@/hooks/useOrganization';
import { useClientPortalChatFlag } from '@/hooks/useClientPortalChatFlag';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  portalCall, PORTAL_ALLOWED_MIME, PORTAL_MAX_SIZE,
  type PortalConversation, type PortalMessage,
} from '@/lib/clientPortalChat';

const POLL_MS = 30_000;
const fmt = (iso: string) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

export default function ClientPortalChatPage() {
  const { organization, userProfile } = useOrganization();
  const enabled = useClientPortalChatFlag(organization?.id);
  const [params, setParams] = useSearchParams();
  const [status, setStatus] = useState<'open' | 'resolved'>('open');
  const selectedId = params.get('c');
  const qc = useQueryClient();

  const list = useInfiniteQuery({
    queryKey: ['portal-chat', 'list', status],
    enabled,
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => portalCall<{ items: PortalConversation[]; nextCursor?: string }>(
      'conversations.list', { status, ...(pageParam ? { cursor: pageParam } : {}) }),
    getNextPageParam: (last) => last.nextCursor,
    refetchInterval: POLL_MS,
  });
  const conversations = useMemo(() => list.data?.pages.flatMap((p) => p.items) ?? [], [list.data]);

  const contactIds = useMemo(() => Array.from(new Set(conversations.map((c) => c.seialzContactId))), [conversations]);
  const { data: contacts } = useQuery({
    queryKey: ['portal-chat', 'contacts', contactIds],
    enabled: contactIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from('contacts').select('id, full_name, phone').in('id', contactIds);
      return new Map((data ?? []).map((c: any) => [c.id, c]));
    },
  });

  // Realtime: aviso do App atualiza a lista e a conversa aberta.
  useEffect(() => {
    if (!enabled || !organization?.id) return;
    const ch = supabase
      .channel(`portal-chat-${Math.random().toString(36).slice(2)}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'client_portal_chat_events', filter: `organization_id=eq.${organization.id}` },
        () => qc.invalidateQueries({ queryKey: ['portal-chat'] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [enabled, organization?.id, qc]);

  if (organization && !enabled) return <Navigate to="/inbox" replace />;

  const selected = conversations.find((c) => c.conversationId === selectedId) ?? null;

  return (
    <Layout>
      <div className="flex h-[calc(100vh-56px)] overflow-hidden">
        <aside className="w-80 shrink-0 border-r border-border flex flex-col">
          <div className="p-3 flex gap-2 border-b border-border">
            {(['open', 'resolved'] as const).map((s) => (
              <Button key={s} size="sm" variant={status === s ? 'default' : 'ghost'} onClick={() => setStatus(s)}>
                {s === 'open' ? 'Abertas' : 'Resolvidas'}
              </Button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            {list.isLoading && <div className="p-4 text-sm text-muted-foreground">Carregando…</div>}
            {list.error && <div className="p-4 text-sm text-destructive">{(list.error as Error).message}</div>}
            {!list.isLoading && !list.error && conversations.length === 0 && (
              <div className="p-4 text-sm text-muted-foreground">Nenhuma conversa.</div>
            )}
            {conversations.map((c) => {
              const ct: any = contacts?.get(c.seialzContactId);
              return (
                <button key={c.conversationId}
                  onClick={() => setParams({ c: c.conversationId })}
                  className={cn('w-full text-left px-3 py-2 border-b border-border hover:bg-muted', c.conversationId === selectedId && 'bg-muted')}>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{ct?.full_name || ct?.phone || 'Cliente'}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{fmt(c.lastMessageAt)}</span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm text-muted-foreground line-clamp-1">{c.lastMessagePreview ?? ''}</span>
                    {c.unreadForStaff > 0 && <Badge className="rounded-full">{c.unreadForStaff}</Badge>}
                  </div>
                  {c.assignedTo && <div className="text-[11px] text-muted-foreground">Responsável: {c.assignedTo.name}</div>}
                </button>
              );
            })}
            {list.hasNextPage && (
              <Button variant="ghost" className="w-full" onClick={() => list.fetchNextPage()} disabled={list.isFetchingNextPage}>
                Carregar mais
              </Button>
            )}
          </div>
        </aside>
        <section className="flex-1 flex flex-col min-w-0">
          {selectedId ? (
            <Conversation key={selectedId} conversationId={selectedId} conversation={selected}
              contactName={(contacts?.get(selected?.seialzContactId ?? '') as any)?.full_name}
              contactId={(contacts?.get(selected?.seialzContactId ?? '') as any)?.id}
              myUserId={userProfile?.id ?? null} />
          ) : (
            <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Selecione uma conversa do App.</div>
          )}
        </section>
      </div>
    </Layout>
  );
}

function Conversation({ conversationId, conversation, contactName, contactId, myUserId }: {
  conversationId: string; conversation: PortalConversation | null; contactName?: string; contactId?: string; myUserId: string | null;
}) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const msgs = useInfiniteQuery({
    queryKey: ['portal-chat', 'messages', conversationId],
    initialPageParam: undefined as string | undefined,
    queryFn: ({ pageParam }) => portalCall<{ items: PortalMessage[] }>(
      'messages.list', { conversationId, ...(pageParam ? { before: pageParam } : {}) }),
    getNextPageParam: (last) => (last.items.length ? last.items[last.items.length - 1].id : undefined),
    refetchInterval: POLL_MS,
  });
  // API devolve mais recentes primeiro; exibimos em ordem cronológica.
  const messages = useMemo(() => {
    const all = msgs.data?.pages.flatMap((p) => p.items) ?? [];
    const seen = new Map(all.map((m) => [m.id, m]));
    return Array.from(seen.values()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [msgs.data]);

  useEffect(() => {
    portalCall('conversation.read', { conversationId })
      .then(() => {
        qc.setQueriesData({ queryKey: ['portal-chat', 'list'] }, (d: any) => zeroConversationUnread(d, conversationId));
        qc.invalidateQueries({ queryKey: PORTAL_MENU_UNREAD_KEY });
      })
      .catch(() => { /* leitura é best-effort */ });
  }, [conversationId, qc]);

  const refresh = () => qc.invalidateQueries({ queryKey: ['portal-chat'] });

  const send = useMutation({
    mutationFn: (p: { body?: string; storagePath?: string; clientMessageId: string }) =>
      portalCall<PortalMessage>('messages.send', { conversationId, ...p }),
    onSuccess: () => { setText(''); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  // Mesmo id ao reenviar o mesmo texto evita duplicata.
  const pendingId = useRef<string>(crypto.randomUUID());

  const action = useMutation({
    mutationFn: ({ op, extra }: { op: string; extra?: Record<string, unknown> }) => portalCall(op, { conversationId, ...extra }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });

  const onSend = () => {
    const body = text.trim();
    if (!body) return;
    send.mutate({ body, clientMessageId: pendingId.current }, { onSuccess: () => { pendingId.current = crypto.randomUUID(); } });
  };

  const onFile = async (file: File) => {
    if (!PORTAL_ALLOWED_MIME.includes(file.type)) return toast.error('Envie apenas JPG, PNG ou PDF.');
    if (file.size > PORTAL_MAX_SIZE) return toast.error('O arquivo passa de 10 MB.');
    setUploading(true);
    try {
      const { uploadUrl, path } = await portalCall<{ uploadUrl: string; path: string }>('attachment.prepare',
        { conversationId, name: file.name, mimeType: file.type, size: file.size });
      const put = await fetch(uploadUrl, { method: 'PUT', headers: { 'Content-Type': file.type }, body: file });
      if (!put.ok) throw new Error('Falha ao enviar o arquivo.');
      await send.mutateAsync({ storagePath: path, clientMessageId: crypto.randomUUID() });
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const assignedToMe = !!myUserId && conversation?.assignedTo?.userId === myUserId;

  return (
    <>
      <header className="px-4 py-2 border-b border-border flex items-center justify-between gap-2">
        <div className="font-medium truncate">
          {contactId
            ? <Link to={`/contacts/${contactId}`} className="hover:underline">{contactName || 'Cliente'}</Link>
            : (contactName || 'Cliente')}
        </div>
        <div className="flex gap-2">
          {!assignedToMe && (
            <Button size="sm" variant="outline" disabled={action.isPending || !myUserId}
              onClick={() => action.mutate({ op: 'conversation.assign', extra: { assignee: { userId: myUserId } } })}>
              <UserCirclePlus className="mr-1" /> Atribuir a mim
            </Button>
          )}
          {conversation?.status === 'resolved' ? (
            <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ op: 'conversation.reopen' })}>
              <ArrowCounterClockwise className="mr-1" /> Reabrir
            </Button>
          ) : (
            <Button size="sm" variant="outline" disabled={action.isPending} onClick={() => action.mutate({ op: 'conversation.resolve' })}>
              <CheckCircle className="mr-1" /> Resolver
            </Button>
          )}
        </div>
      </header>
      <div className="px-4 py-2 bg-muted text-sm flex items-center gap-2 border-b border-border">
        <Info className="shrink-0" />
        Esta conversa é pelo App: a resposta chega no aplicativo do cliente, não pelo WhatsApp.
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {msgs.hasNextPage && (
          <Button variant="ghost" size="sm" className="mx-auto block" onClick={() => msgs.fetchNextPage()} disabled={msgs.isFetchingNextPage}>
            Mensagens anteriores
          </Button>
        )}
        {msgs.isLoading && <div className="text-sm text-muted-foreground">Carregando…</div>}
        {msgs.error && <div className="text-sm text-destructive">{(msgs.error as Error).message}</div>}
        {messages.map((m) => (
          <div key={m.id} className={cn('flex', m.from === 'staff' ? 'justify-end' : 'justify-start')}>
            <div className={cn('max-w-[70%] rounded-md px-3 py-2', m.from === 'staff' ? 'bg-primary text-primary-foreground' : 'bg-muted')}>
              {m.from === 'staff' && m.staffName && <div className="text-[11px] opacity-80">{m.staffName}</div>}
              {m.body && <div className="whitespace-pre-wrap text-sm">{m.body}</div>}
              {m.attachments?.map((a) => a.mimeType.startsWith('image/') ? (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer"><img src={a.url} alt={a.name} className="mt-1 max-h-60 rounded-md" /></a>
              ) : (
                <a key={a.id} href={a.url} target="_blank" rel="noreferrer" className="mt-1 flex items-center gap-1 underline text-sm">
                  <FilePdf /> {a.name}
                </a>
              ))}
              <div className="text-[11px] opacity-70 text-right">{fmt(m.createdAt)}{m.readByClientAt ? ' · lida' : ''}</div>
            </div>
          </div>
        ))}
      </div>
      <div className="p-3 border-t border-border flex items-end gap-2">
        <input ref={fileRef} type="file" accept={PORTAL_ALLOWED_MIME.join(',')} className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f); }} />
        <Button variant="ghost" size="icon" aria-label="Anexar foto ou PDF" disabled={uploading} onClick={() => fileRef.current?.click()}>
          {uploading ? <SpinnerGap className="animate-spin" /> : <Paperclip />}
        </Button>
        <Textarea value={text} maxLength={4000} rows={1} placeholder="Responder pelo App…" className="resize-none"
          onChange={(e) => { setText(e.target.value); pendingId.current = crypto.randomUUID(); }}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); } }} />
        <Button aria-label="Enviar" disabled={!text.trim() || send.isPending} onClick={onSend}><PaperPlaneRight /></Button>
      </div>
    </>
  );
}
