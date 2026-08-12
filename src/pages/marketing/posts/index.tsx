import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from '../_components/MarketingLayout';
import { useMarketingPublishingFlag } from '@/hooks/useMarketingPublishingFlag';
import { usePagePostsList, usePublishPost, type PagePost, type PublishTarget } from '../_hooks/usePagePosts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { FacebookLogo, InstagramLogo, PaperPlaneTilt, ArrowSquareOut, SpinnerGap } from '@phosphor-icons/react';
import { toast } from 'sonner';

function fmtDate(s?: string) {
  if (!s) return '';
  try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

function PostRow({ p, platform }: { p: PagePost; platform: 'facebook' | 'instagram' }) {
  const Icon = platform === 'facebook' ? FacebookLogo : InstagramLogo;
  return (
    <div className="flex items-start gap-3 p-3 border-b border-border last:border-0">
      {p.image ? (
        <img src={p.image} alt="" className="h-12 w-12 rounded object-cover shrink-0" />
      ) : (
        <div className="h-12 w-12 rounded bg-muted flex items-center justify-center shrink-0"><Icon size={18} className="text-muted-foreground" /></div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-sm line-clamp-2">{p.message || <span className="text-muted-foreground italic">(sem legenda)</span>}</p>
        <p className="text-[11px] text-muted-foreground mt-0.5">{fmtDate(p.created_time)}</p>
      </div>
      {p.permalink && (
        <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary shrink-0" title="Abrir">
          <ArrowSquareOut size={16} />
        </a>
      )}
    </div>
  );
}

export default function MarketingPosts() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { enabled, loading: flagLoading } = useMarketingPublishingFlag(orgId);

  const [message, setMessage] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [toFb, setToFb] = useState(true);
  const [toIg, setToIg] = useState(false);

  const list = usePagePostsList(enabled ? orgId : undefined);
  const publish = usePublishPost(orgId);

  if (flagLoading) {
    return <MarketingLayout title="Publicações"><Skeleton className="h-40 w-full" /></MarketingLayout>;
  }
  if (!enabled) return <Navigate to="/marketing" replace />;

  const targets: PublishTarget[] = [...(toFb ? ['facebook'] as const : []), ...(toIg ? ['instagram'] as const : [])];
  const igNeedsImage = toIg && !imageUrl.trim();
  const canPublish = !!message.trim() || !!imageUrl.trim();

  const onPublish = async () => {
    if (targets.length === 0) { toast.error('Escolha ao menos um destino.'); return; }
    if (igNeedsImage) { toast.error('Instagram exige uma imagem.'); return; }
    try {
      const result = await publish.mutateAsync({ message: message.trim(), image_url: imageUrl.trim() || undefined, targets });
      const oks = Object.entries(result).filter(([, r]) => r.id).map(([k]) => k);
      const errs = Object.entries(result).filter(([, r]) => r.error);
      if (oks.length) toast.success(`Publicado em ${oks.map((k) => (k === 'facebook' ? 'Facebook' : 'Instagram')).join(' e ')}`);
      errs.forEach(([k, r]) => toast.error(`${k === 'facebook' ? 'Facebook' : 'Instagram'}: ${r.error}`));
      if (oks.length) { setMessage(''); setImageUrl(''); }
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha ao publicar');
    }
  };

  return (
    <MarketingLayout title="Publicações">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,420px)_1fr]">
        {/* Compositor */}
        <Card className="p-4 sm:p-5 space-y-4 h-fit">
          <div>
            <h2 className="text-base font-semibold">Publicar conteúdo</h2>
            <p className="text-xs text-muted-foreground">Publique um post na Página do Facebook e/ou no Instagram do negócio.</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Texto</Label>
            <Textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Escreva a legenda…" rows={5} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Imagem (URL) <span className="text-muted-foreground">— opcional no Facebook, obrigatória no Instagram</span></Label>
            <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="https://…/imagem.jpg" />
          </div>
          <div className="space-y-2">
            <Label className="text-xs">Destinos</Label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={toFb} onCheckedChange={(v) => setToFb(v === true)} />
              <FacebookLogo size={16} className="text-[#1877F2]" /> Facebook (Página)
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <Checkbox checked={toIg} onCheckedChange={(v) => setToIg(v === true)} />
              <InstagramLogo size={16} className="text-[#E1306C]" /> Instagram
            </label>
            {igNeedsImage && <p className="text-[11px] text-amber-600">Instagram precisa de uma imagem.</p>}
          </div>
          <Button onClick={onPublish} disabled={publish.isPending || !canPublish} className="w-full">
            {publish.isPending ? <SpinnerGap className="h-4 w-4 mr-1 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4 mr-1" />}
            Publicar
          </Button>
        </Card>

        {/* Publicados recentes */}
        <div className="space-y-4">
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b border-border">
              <FacebookLogo size={18} className="text-[#1877F2]" />
              <h3 className="text-sm font-semibold">Facebook — recentes</h3>
            </div>
            {list.isLoading ? <div className="p-3"><Skeleton className="h-16 w-full" /></div>
              : (list.data?.facebook.length ?? 0) === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum post recente.</p>
              : list.data!.facebook.map((p) => <PostRow key={p.id} p={p} platform="facebook" />)}
          </Card>
          <Card className="p-0 overflow-hidden">
            <div className="flex items-center gap-2 p-3 border-b border-border">
              <InstagramLogo size={18} className="text-[#E1306C]" />
              <h3 className="text-sm font-semibold">Instagram — recentes</h3>
            </div>
            {list.isLoading ? <div className="p-3"><Skeleton className="h-16 w-full" /></div>
              : (list.data?.instagram.length ?? 0) === 0 ? <p className="p-4 text-sm text-muted-foreground">Nenhum conteúdo recente.</p>
              : list.data!.instagram.map((p) => <PostRow key={p.id} p={p} platform="instagram" />)}
          </Card>
        </div>
      </div>
    </MarketingLayout>
  );
}
