import { useEffect, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowSquareOut, Megaphone } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { adImageCandidates } from '@/lib/adMedia';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { uiText } from '@/lib/ui-locale';

export function AdImage({ mediaUrl, thumbnailUrl, className, fallback = null, onOpen }: {
  mediaUrl: string | null | undefined;
  thumbnailUrl: string | null | undefined;
  className?: string;
  fallback?: ReactNode;
  onOpen?: (src: string) => void;
}) {
  const candidates = adImageCandidates(mediaUrl, thumbnailUrl);
  const key = candidates.join('|');
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [key]);

  const src = candidates[index];
  if (!src) return <>{fallback}</>;
  const image = <img src={src} alt={uiText('Anúncio')} loading="lazy" className={className} onError={() => setIndex((i) => i + 1)} />;
  if (!onOpen) return image;
  return (
    <button type="button" onClick={() => onOpen(src)} aria-label={uiText('Ampliar imagem do anúncio')} className="shrink-0 cursor-zoom-in rounded-md">
      {image}
    </button>
  );
}

// De qual anúncio o contato veio. Sem dados de anúncio, não mostra nada.
export function AdOriginCard({ contactId, className = '' }: { contactId: string | null | undefined; className?: string }) {
  const [openSrc, setOpenSrc] = useState<string | null>(null);
  useEffect(() => setOpenSrc(null), [contactId]);
  const { data: ad } = useQuery({
    queryKey: ['contact-ad-origin', contactId],
    enabled: !!contactId,
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('contacts')
        .select('organization_id, ad_referral_source_id, ad_referral_headline, ad_referral_body, ad_referral_media_url, ad_referral_source_url, marketing_campaign:marketing_campaign_id(creative_thumbnail_url)')
        .eq('id', contactId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const ownText = ad?.ad_referral_body?.trim() || null;
  // A Meta só manda o texto em parte dos leads: busca o do mesmo anúncio ao ampliar.
  const { data: sharedText } = useQuery({
    queryKey: ['ad-referral-text', ad?.organization_id, ad?.ad_referral_source_id],
    enabled: !!openSrc && !ownText && !!ad?.organization_id && !!ad?.ad_referral_source_id,
    staleTime: 60 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_ad_referral_text' as any, {
        _org: ad!.organization_id,
        _source_id: ad!.ad_referral_source_id,
      });
      if (error) throw error;
      return (data as unknown as string | null) ?? null;
    },
  });

  if (!ad || !(ad.ad_referral_source_id || ad.ad_referral_headline)) return null;

  const adLink = ad.ad_referral_source_url && (
    <a href={ad.ad_referral_source_url} target="_blank" rel="noopener noreferrer" className="text-xs text-primary hover:underline inline-flex items-center gap-1">
      {uiText('Abrir anúncio')} <ArrowSquareOut className="h-3 w-3" />
    </a>
  );
  const fullText = ownText ?? sharedText;

  const placeholder = (
    <div className="h-16 w-16 shrink-0 rounded-md bg-muted flex items-center justify-center">
      <Megaphone className="h-6 w-6 text-muted-foreground" />
    </div>
  );

  return (
    <div className={`flex gap-3 rounded-lg border border-border bg-card p-2.5 ${className}`}>
      <AdImage
        mediaUrl={ad.ad_referral_media_url}
        thumbnailUrl={(ad.marketing_campaign as { creative_thumbnail_url: string | null } | null)?.creative_thumbnail_url}
        className="h-16 w-16 shrink-0 rounded-md object-cover"
        fallback={placeholder}
        onOpen={setOpenSrc}
      />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-muted-foreground">{uiText('Veio deste anúncio')}</div>
        {ad.ad_referral_headline && <div className="text-sm font-medium text-foreground truncate">{ad.ad_referral_headline}</div>}
        {ad.ad_referral_body && <div className="text-xs text-muted-foreground line-clamp-1">{ad.ad_referral_body}</div>}
        {adLink}
      </div>
      <Dialog open={!!openSrc} onOpenChange={(open) => { if (!open) setOpenSrc(null); }}>
        <DialogContent size="lg" className="max-h-[90vh] overflow-y-auto">
          <DialogTitle>{ad.ad_referral_headline || uiText('Anúncio')}</DialogTitle>
          {openSrc && <img src={openSrc} alt={uiText('Anúncio')} className="w-full max-h-[65vh] rounded-md object-contain bg-muted" />}
          {fullText && <p className="text-sm text-foreground whitespace-pre-line">{fullText}</p>}
          {adLink}
        </DialogContent>
      </Dialog>
    </div>
  );
}
