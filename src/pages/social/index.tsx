import { useMemo, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Layout } from '@/components/Layout';
import { useOrganization } from '@/hooks/useOrganization';
import { useMarketingPublishingFlag } from '@/hooks/useMarketingPublishingFlag';
import {
  useSocialConversations, useSocialMessages, useSendSocialMessage, useSocialProfile,
  type SocialConversation, type SocialPlatform, type SocialAttachment, type SocialMessage,
} from './useSocialInbox';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { InstagramLogo, MessengerLogo, PaperPlaneTilt, ChatsCircle, WarningCircle, ArrowSquareOut, Paperclip, SealCheck, Users } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

function PlatformIcon({ platform, className }: { platform: SocialPlatform; className?: string }) {
  return platform === 'instagram'
    ? <InstagramLogo className={cn('text-pink-600', className)} weight="fill" />
    : <MessengerLogo className={cn('text-blue-600', className)} weight="fill" />;
}

function initials(name: string) {
  return name.split(' ').filter(Boolean).slice(0, 2).map((n) => n[0]?.toUpperCase()).join('') || '?';
}

function fmtTime(iso: string) {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    const today = new Date();
    const sameDay = d.toDateString() === today.toDateString();
    return sameDay
      ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      : d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch { return ''; }
}

function AttachmentView({ att, fromPage }: { att: SocialAttachment; fromPage: boolean }) {
  if (att.type === 'image') {
    return (
      <a href={att.url} target="_blank" rel="noreferrer" className="block">
        <img src={att.url} alt={att.name || 'imagem'} className="max-w-[220px] max-h-60 rounded-lg object-cover" />
      </a>
    );
  }
  if (att.type === 'video') {
    return <video src={att.url} controls className="max-w-[240px] max-h-64 rounded-lg" />;
  }
  if (att.type === 'audio') {
    return <audio src={att.url} controls className="max-w-[240px]" />;
  }
  // file / share → link
  return (
    <a href={att.url} target="_blank" rel="noreferrer"
      className={cn('inline-flex items-center gap-1.5 text-xs underline underline-offset-2', fromPage ? 'text-primary-foreground' : 'text-foreground')}>
      {att.type === 'share' ? <ArrowSquareOut className="h-3.5 w-3.5" /> : <Paperclip className="h-3.5 w-3.5" />}
      {att.name || (att.type === 'share' ? 'Ver publicação' : 'Abrir anexo')}
    </a>
  );
}

function MessageBubble({ m }: { m: SocialMessage }) {
  const atts = m.attachments ?? [];
  const empty = !m.text && atts.length === 0;
  return (
    <div className={cn('flex', m.from_page ? 'justify-end' : 'justify-start')}>
      <div className={cn(
        'max-w-[75%] rounded-2xl px-3 py-2 text-sm space-y-1.5',
        m.from_page ? 'bg-primary text-primary-foreground rounded-br-sm' : 'bg-muted rounded-bl-sm',
      )}>
        {atts.map((a, i) => <AttachmentView key={i} att={a} fromPage={m.from_page} />)}
        {m.text && <div className="whitespace-pre-wrap break-words">{m.text}</div>}
        {empty && <span className="italic opacity-70">(sem texto)</span>}
        <div className={cn('text-[10px]', m.from_page ? 'text-primary-foreground/70' : 'text-muted-foreground')}>
          {fmtTime(m.created_time)}
        </div>
      </div>
    </div>
  );
}

export default function SocialInboxPage() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { enabled, loading: flagLoading } = useMarketingPublishingFlag(orgId);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');

  const convos = useSocialConversations(enabled ? orgId : undefined);
  const messages = useSocialMessages(orgId, selectedId);
  const send = useSendSocialMessage(orgId);

  const selected = useMemo<SocialConversation | null>(
    () => convos.data?.conversations.find((c) => c.id === selectedId) ?? null,
    [convos.data, selectedId],
  );
  const profile = useSocialProfile(orgId, selected?.participant_id, selected?.platform).data;

  if (!orgId || flagLoading) {
    return <Layout><div className="p-6"><Skeleton className="h-[70vh] w-full" /></div></Layout>;
  }
  if (!enabled) return <Navigate to="/" replace />;

  const conversations = convos.data?.conversations ?? [];
  const channels = convos.data?.channels ?? {};
  const channelErrors = Object.entries(channels).filter(([, v]) => v);

  const doSend = async () => {
    const text = draft.trim();
    if (!text || !selected) return;
    if (!selected.participant_id) { toast.error('Sem destinatário para esta conversa'); return; }
    try {
      await send.mutateAsync({
        conversation_id: selected.id,
        recipient_id: selected.participant_id,
        text,
        platform: selected.platform,
      });
      setDraft('');
    } catch (e) { toast.error((e as Error)?.message || 'Falha ao enviar'); }
  };

  return (
    <Layout>
      <div className="h-full flex flex-col min-h-0">
        <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
          <ChatsCircle size={24} weight="light" className="text-primary" />
          <div>
            <h1 className="text-xl font-bold leading-tight">Social</h1>
            <p className="text-xs text-muted-foreground">Direct do Instagram e Messenger do Facebook num só lugar.</p>
          </div>
        </div>

        {channelErrors.length > 0 && (
          <div className="mx-6 mt-3 flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
            <WarningCircle className="h-4 w-4 shrink-0 mt-0.5" weight="fill" />
            <div>
              {channelErrors.map(([ch, msg]) => (
                <div key={ch}><span className="font-medium capitalize">{ch}</span>: {msg}</div>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 flex min-h-0 overflow-hidden">
          {/* Lista de conversas */}
          <aside className="w-80 shrink-0 border-r border-border flex flex-col min-h-0">
            <ScrollArea className="flex-1">
              {convos.isLoading ? (
                <div className="p-3 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
              ) : conversations.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">Nenhuma conversa encontrada.</p>
              ) : conversations.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedId(c.id); setDraft(''); }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left border-b border-border/60 hover:bg-muted/50 transition-colors',
                    selectedId === c.id && 'bg-muted',
                  )}
                >
                  <div className="relative shrink-0">
                    <Avatar className="h-9 w-9"><AvatarFallback className="text-xs">{initials(c.name)}</AvatarFallback></Avatar>
                    <PlatformIcon platform={c.platform} className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-background p-[1px]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium truncate">{c.name}</p>
                      <span className="text-[10px] text-muted-foreground shrink-0">{fmtTime(c.updated_time)}</span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{c.last_message || '—'}</p>
                  </div>
                </button>
              ))}
            </ScrollArea>
          </aside>

          {/* Thread */}
          <section className="flex-1 flex flex-col min-h-0">
            {!selected ? (
              <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
                Selecione uma conversa para ver as mensagens.
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  <div className="relative shrink-0">
                    <Avatar className="h-9 w-9">
                      {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={selected.name} />}
                      <AvatarFallback className="text-xs">{initials(selected.name)}</AvatarFallback>
                    </Avatar>
                    <PlatformIcon platform={selected.platform} className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full bg-background p-[1px]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-sm font-semibold truncate">{selected.name}</p>
                      {profile?.is_verified && <SealCheck className="h-4 w-4 text-blue-500 shrink-0" weight="fill" />}
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                      {(selected.profile_link || profile?.profile_link) && (
                        <a href={(selected.profile_link || profile?.profile_link)!} target="_blank" rel="noreferrer"
                          className="inline-flex items-center gap-0.5 text-primary hover:underline">
                          @{selected.username || profile?.username} <ArrowSquareOut className="h-3 w-3" />
                        </a>
                      )}
                      {typeof profile?.follower_count === 'number' && (
                        <span className="inline-flex items-center gap-0.5">
                          <Users className="h-3 w-3" />{profile.follower_count.toLocaleString('pt-BR')}
                        </span>
                      )}
                      {profile?.follows_us && <Badge variant="outline" className="h-4 px-1 text-[9px]">Segue você</Badge>}
                    </div>
                  </div>
                </div>

                <ScrollArea className="flex-1 px-4 py-3">
                  {messages.isLoading ? (
                    <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10 w-2/3" />)}</div>
                  ) : messages.isError ? (
                    <p className="text-sm text-destructive">{(messages.error as Error)?.message || 'Erro ao carregar'}</p>
                  ) : (messages.data ?? []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">Sem mensagens.</p>
                  ) : (
                    <div className="space-y-2">
                      {(messages.data ?? []).map((m) => <MessageBubble key={m.id} m={m} />)}
                    </div>
                  )}
                </ScrollArea>

                <div className="border-t border-border p-3">
                  <div className="flex items-end gap-2">
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); doSend(); } }}
                      placeholder="Escreva uma resposta…"
                      className="min-h-[44px] max-h-40 resize-none"
                    />
                    <Button onClick={doSend} disabled={!draft.trim() || send.isPending} className="h-11 shrink-0">
                      <PaperPlaneTilt className="h-4 w-4" weight="fill" />
                    </Button>
                  </div>
                  <p className="mt-1 text-[10px] text-muted-foreground">Enter envia · Shift+Enter quebra linha</p>
                </div>
              </>
            )}
          </section>
        </div>
      </div>
    </Layout>
  );
}
