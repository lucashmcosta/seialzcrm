import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { uiError } from '@/lib/ui-locale';
import { getUiLocale, uiDateLocale, uiDatePattern } from '@/lib/ui-locale';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from '../_components/MarketingLayout';
import { useMarketingPublishingFlag } from '@/hooks/useMarketingPublishingFlag';
import { useCommentsList, useCommentActions, type MetaComment } from '../_hooks/useComments';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { FacebookLogo, InstagramLogo, ArrowSquareOut, TrashSimple, EyeSlash, Eye, ArrowBendUpLeft, SpinnerGap, PaperPlaneTilt } from '@phosphor-icons/react';
import { toast } from 'sonner';

function fmtDate(s?: string) {
  if (!s) return '';
  try { return new Date(s).toLocaleString(getUiLocale(), { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

function CommentRow({ c, orgId }: { c: MetaComment; orgId?: string }) {
  useUiLocale();
  const { reply, hide, remove } = useCommentActions(orgId);
  const [replying, setReplying] = useState(false);
  const [text, setText] = useState('');
  const Icon = c.platform === 'facebook' ? FacebookLogo : InstagramLogo;
  const color = c.platform === 'facebook' ? 'text-[#1877F2]' : 'text-[#E1306C]';

  const onReply = async () => {
    if (!text.trim()) return;
    try {
      await reply.mutateAsync({ comment_id: c.id, platform: c.platform, message: text.trim() });
      toast.success(uiText("Resposta enviada")); setText(''); setReplying(false);
    } catch (e) { toast.error(uiError((e as Error)?.message || uiText("Falha ao responder"))); }
  };
  const onHide = async () => {
    try { await hide.mutateAsync({ comment_id: c.id, hidden: !c.is_hidden }); toast.success(c.is_hidden ? uiText("Comentário exibido") : uiText("Comentário ocultado")); }
    catch (e) { toast.error(uiError((e as Error)?.message || uiText("Falha"))); }
  };
  const onDelete = async () => {
    try { await remove.mutateAsync({ comment_id: c.id, platform: c.platform }); toast.success(uiText("Comentário apagado")); }
    catch (e) { toast.error(uiError((e as Error)?.message || uiText("Falha ao apagar"))); }
  };
  const busy = reply.isPending || hide.isPending || remove.isPending;

  return (
    <div className="p-3 border-b border-border last:border-0">
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 shrink-0">
          <AvatarImage src={c.author_avatar_url || undefined} alt={c.author} />
          <AvatarFallback>{c.author ? c.author.split(' ').slice(0,2).map(n=>n[0]).join('') : <Icon size={18} className={color} />}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <span className="font-medium">{c.author || uiText("Alguém")}</span>{' '}
            <span className={c.is_hidden ? 'text-muted-foreground line-through' : ''}>{c.text || <span className="italic text-muted-foreground">{uiText("(sem texto)")}</span>}</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5 truncate">
            {fmtDate(c.created_time)} {uiText("· no post:")}{c.post_excerpt || '—'}{c.is_hidden ? uiText(" · oculto") : ''}
          </p>
          {replying && (
            <div className="flex items-center gap-2 mt-2">
              <Input value={text} onChange={(e) => setText(e.target.value)} placeholder={uiText("Responder…")} className="h-8" onKeyDown={(e) => e.key === 'Enter' && onReply()} />
              <Button size="sm" className="h-8" onClick={onReply} disabled={busy || !text.trim()}><PaperPlaneTilt size={14} /></Button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => setReplying((v) => !v)} disabled={busy} className="text-muted-foreground hover:text-primary p-1" title={uiText("Responder")}><ArrowBendUpLeft size={16} /></button>
          {c.platform === 'facebook' && (
            <button type="button" onClick={onHide} disabled={busy} className="text-muted-foreground hover:text-foreground p-1" title={c.is_hidden ? uiText("Exibir") : uiText("Ocultar")}>
              {c.is_hidden ? <Eye size={16} /> : <EyeSlash size={16} />}
            </button>
          )}
          <button type="button" onClick={onDelete} disabled={busy} className="text-muted-foreground hover:text-destructive p-1" title={uiText("Apagar")}>
            {remove.isPending ? <SpinnerGap size={16} className="animate-spin" /> : <TrashSimple size={16} />}
          </button>
          {c.permalink && (
            <a href={c.permalink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary p-1" title={uiText("Abrir post")}><ArrowSquareOut size={16} /></a>
          )}
        </div>
      </div>
    </div>
  );
}

export default function MarketingComments() {
  useUiLocale();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { enabled, loading: flagLoading } = useMarketingPublishingFlag(orgId);
  const list = useCommentsList(enabled ? orgId : undefined);

  // Não redireciona enquanto a org/flag ainda carregam (evita corrida no acesso direto).
  if (!orgId || flagLoading) {
    return <MarketingLayout title={uiText("Comentários")}><Skeleton className="h-40 w-full" /></MarketingLayout>;
  }
  if (!enabled) return <Navigate to="/marketing" replace />;

  const comments = list.data?.comments ?? [];

  return (
    <MarketingLayout title={uiText("Comentários")}>
      <Card className="p-0 overflow-hidden max-w-3xl">
        <div className="p-3 border-b border-border">
          <h2 className="text-sm font-semibold">{uiText("Comentários recentes (Facebook + Instagram)")}</h2>
          <p className="text-xs text-muted-foreground">{uiText("Responda, oculte ou apague comentários dos posts do negócio.")}</p>
        </div>
        {(list.error || Object.keys(list.data?.channels ?? {}).length > 0) && <p role="alert" className="p-4 text-sm text-destructive">{uiText('Não foi possível carregar todos os comentários.')}</p>}
        {list.isLoading ? <div className="p-3 space-y-2"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          : comments.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{uiText("Nenhum comentário recente nos posts.")}</p>
          : comments.map((c) => <CommentRow key={`${c.platform}-${c.id}`} c={c} orgId={orgId} />)}
      </Card>
    </MarketingLayout>
  );
}
