import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useOrganization } from '@/hooks/useOrganization';
import { MarketingLayout } from '../_components/MarketingLayout';
import { useMarketingPublishingFlag } from '@/hooks/useMarketingPublishingFlag';
import { usePagePostsList, usePublishPost, useDeletePost, uploadMarketingImage, type PagePost, type PublishTarget } from '../_hooks/usePagePosts';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { FacebookLogo, InstagramLogo, PaperPlaneTilt, ArrowSquareOut, SpinnerGap, ImageSquare, X, TrashSimple } from '@phosphor-icons/react';
import { toast } from 'sonner';

function fmtDate(s?: string) {
  if (!s) return '';
  try { return new Date(s).toLocaleString('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch { return s; }
}

function PostRow({ p, platform, onDelete, deleting }: { p: PagePost; platform: 'facebook' | 'instagram'; onDelete?: () => void; deleting?: boolean }) {
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
      <div className="flex items-center gap-1 shrink-0">
        {p.permalink && (
          <a href={p.permalink} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary p-1" title="Abrir">
            <ArrowSquareOut size={16} />
          </a>
        )}
        {onDelete && (
          <button type="button" onClick={onDelete} disabled={deleting} className="text-muted-foreground hover:text-destructive p-1 disabled:opacity-50" title="Apagar">
            {deleting ? <SpinnerGap size={16} className="animate-spin" /> : <TrashSimple size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

export default function MarketingPosts() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { enabled, loading: flagLoading } = useMarketingPublishingFlag(orgId);

  const [message, setMessage] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [toFb, setToFb] = useState(true);
  const [toIg, setToIg] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const list = usePagePostsList(enabled ? orgId : undefined);
  const publish = usePublishPost(orgId);
  const del = useDeletePost(orgId);

  // Não redireciona enquanto a org/flag ainda carregam (evita corrida no acesso direto).
  if (!orgId || flagLoading) {
    return <MarketingLayout title="Publicações"><Skeleton className="h-40 w-full" /></MarketingLayout>;
  }
  if (!enabled) return <Navigate to="/marketing" replace />;

  const targets: PublishTarget[] = [...(toFb ? ['facebook'] as const : []), ...(toIg ? ['instagram'] as const : [])];
  const igNeedsImage = toIg && !imageFile;
  const canPublish = !!message.trim() || !!imageFile;
  const busy = publish.isPending || uploading;

  const onPublish = async () => {
    if (targets.length === 0) { toast.error('Escolha ao menos um destino.'); return; }
    if (igNeedsImage) { toast.error('Instagram exige uma imagem.'); return; }
    try {
      let image_url: string | undefined;
      if (imageFile && orgId) {
        setUploading(true);
        image_url = await uploadMarketingImage(orgId, imageFile);
        setUploading(false);
      }
      const result = await publish.mutateAsync({ message: message.trim(), image_url, targets });
      const oks = Object.entries(result).filter(([, r]) => r.id).map(([k]) => k);
      const errs = Object.entries(result).filter(([, r]) => r.error);
      if (oks.length) toast.success(`Publicado em ${oks.map((k) => (k === 'facebook' ? 'Facebook' : 'Instagram')).join(' e ')}`);
      errs.forEach(([k, r]) => toast.error(`${k === 'facebook' ? 'Facebook' : 'Instagram'}: ${r.error}`));
      if (oks.length) { setMessage(''); setImageFile(null); }
    } catch (e) {
      setUploading(false);
      toast.error((e as Error)?.message || 'Falha ao publicar');
    }
  };

  const onDeletePost = async (post: PagePost, platform: PublishTarget) => {
    setDeletingId(post.id);
    try {
      await del.mutateAsync({ post_id: post.id, platform });
      toast.success('Post apagado');
    } catch (e) {
      toast.error((e as Error)?.message || 'Falha ao apagar');
    } finally {
      setDeletingId(null);
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
            <Label className="text-xs">Imagem <span className="text-muted-foreground">— opcional no Facebook, obrigatória no Instagram</span></Label>
            {imageFile ? (
              <div className="flex items-center gap-2 rounded-md border p-2">
                <img src={URL.createObjectURL(imageFile)} alt="" className="h-10 w-10 rounded object-cover" />
                <span className="text-xs truncate flex-1">{imageFile.name}</span>
                <button type="button" onClick={() => setImageFile(null)} className="text-muted-foreground hover:text-destructive p-1" title="Remover"><X size={14} /></button>
              </div>
            ) : (
              <label className="flex items-center gap-2 rounded-md border border-dashed p-3 text-sm text-muted-foreground cursor-pointer hover:border-primary hover:text-foreground">
                <ImageSquare size={18} /> Enviar imagem…
                <input type="file" accept="image/*" className="hidden" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
              </label>
            )}
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
          <Button onClick={onPublish} disabled={busy || !canPublish} className="w-full">
            {busy ? <SpinnerGap className="h-4 w-4 mr-1 animate-spin" /> : <PaperPlaneTilt className="h-4 w-4 mr-1" />}
            {uploading ? 'Enviando imagem…' : 'Publicar'}
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
              : list.data!.facebook.map((p) => <PostRow key={p.id} p={p} platform="facebook" onDelete={() => onDeletePost(p, 'facebook')} deleting={deletingId === p.id} />)}
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
