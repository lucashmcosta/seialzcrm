// Pixel do site: código que o cliente instala (direto ou pelo GTM) para gravar de onde
// cada visitante veio e levar isso ao formulário e ao WhatsApp aberto pelo site.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowClockwise } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { MarketingLayout } from '../_components/MarketingLayout';
import { CopyField } from '../_components/CopyField';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { pixelSnippet } from '@/lib/sitePixel';

interface PixelVisit {
  at: string; host: string | null; referrer: string | null; utm_source: string | null; utm_medium: string | null;
  utm_campaign: string | null; click: 'google' | 'meta' | null; direct: boolean; linked: boolean;
}
interface PixelInfo {
  key: string; visits_24h: number; visits_7d: number; linked_30d: number; last_visit_at: string | null;
  hosts: { host: string; visits: number }[]; recent: PixelVisit[];
}

function visitSource(v: PixelVisit): string {
  if (v.click === 'google') return uiText('Anúncio do Google');
  if (v.click === 'meta') return uiText('Anúncio da Meta');
  if (v.utm_source) return [v.utm_source, v.utm_medium, v.utm_campaign].filter(Boolean).join(' · ');
  if (v.referrer) return uiText('Veio de') + ' ' + v.referrer.replace(/^https?:\/\//, '').replace(/\/$/, '');
  return uiText('Direto');
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}

export default function MarketingPixel() {
  useUiLocale();
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [waitConsent, setWaitConsent] = useState(false);
  const [waText, setWaText] = useState('');
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['site-pixel', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('rpc_site_pixel_v1' as never, { p_org: orgId } as never);
      if (error) throw error;
      return data as unknown as PixelInfo;
    },
  });
  const snippet = useMemo(
    () => (data?.key ? pixelSnippet(window.location.origin, data.key, { waitConsent, waText }) : ''),
    [data?.key, waitConsent, waText],
  );
  const fmt = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' });

  return (
    <MarketingLayout title={uiText('Pixel do site')}>
      <div className="grid max-w-5xl gap-4 lg:grid-cols-[1fr_22rem]">
        <Card className="space-y-4 p-5">
          <p className="text-sm text-muted-foreground">
            {uiText('Coloque este código no site. Ele grava de onde cada visitante veio (anúncio, UTM, Google, Instagram…) e leva isso para o formulário e para a conversa de WhatsApp aberta pelo site. O lead entra no Seialz com a origem certa.')}
          </p>
          {isLoading || !data ? <p className="text-sm text-muted-foreground">{uiText('Carregando...')}</p> : (
            <>
              <CopyField label={uiText('Código de instalação')} value={snippet} />
              <div className="flex items-start justify-between gap-3 rounded-lg border p-3">
                <div>
                  <p className="text-sm font-medium">{uiText('Esperar o aceite de cookies')}</p>
                  <p className="text-xs text-muted-foreground">
                    {uiText('Ligue se o site pede aceite antes de gravar cookies. O pixel só começa quando o site chamar:')}{' '}
                    <code className="rounded bg-muted px-1">seialzPixel('consent', true)</code>
                  </p>
                </div>
                <Switch checked={waitConsent} onCheckedChange={setWaitConsent} />
              </div>
              <div className="space-y-1">
                <Label>{uiText('Mensagem do WhatsApp quando o botão não tem texto')}</Label>
                <Input value={waText} onChange={(e) => setWaText(e.target.value)} placeholder={uiText('Olá!')} maxLength={120} />
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{uiText('Como instalar')}</p>
                <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
                  <li>{uiText('Pelo Google Tag Manager: Tags › Nova › HTML personalizado. Cole o código, escolha o acionador "All Pages" (ou o acionador do aceite de cookies) e publique.')}</li>
                  <li>{uiText('Direto no site: cole o código antes de </head> em todas as páginas.')}</li>
                  <li>{uiText('Para testar, abra o site com ?utm_source=teste no fim do endereço. A visita aparece aqui ao lado em alguns segundos.')}</li>
                </ol>
              </div>
              <div className="space-y-2 text-sm">
                <p className="font-medium">{uiText('O que ele faz')}</p>
                <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
                  <li>{uiText('Formulários do site: acrescenta campos escondidos com a origem (utm_source, gclid, fbclid…). Funciona com os formulários que mandam os dados para o Seialz pelo webhook.')}</li>
                  <li>{uiText('Botões de WhatsApp: acrescenta um código curto no fim da mensagem, como [sz:AB12CD34]. Quando a mensagem chega, o Seialz liga a conversa à visita.')}</li>
                  <li>{uiText('Grava o IP da visita para casar com as conversões dos anúncios. Não grava o navegador nem o que a pessoa digita. Visitas que não viram contato são apagadas depois de 13 meses.')}</li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  {uiText('LGPD: o aviso de cookies e a política de privacidade do site precisam dizer que o site guarda a origem da visita e o IP para atendimento e medição de anúncios.')}
                </p>
              </div>
            </>
          )}
        </Card>
        <Card className="space-y-3 p-5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{uiText('Recebido')}</p>
            <Button variant="ghost" size="sm" onClick={() => refetch()} disabled={isFetching}>
              <ArrowClockwise className={`h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} />
            </Button>
          </div>
          {data && (
            <>
              <div className="grid grid-cols-2 gap-2">
                <Stat label={uiText('Visitas em 24h')} value={data.visits_24h} />
                <Stat label={uiText('Visitas em 7 dias')} value={data.visits_7d} />
                <Stat label={uiText('Contatos ligados (30d)')} value={data.linked_30d} />
                <Stat label={uiText('Última visita')} value={data.last_visit_at ? fmt(data.last_visit_at) : '—'} />
              </div>
              {data.visits_7d === 0 && (
                <p className="rounded-lg border border-dashed p-3 text-xs text-muted-foreground">
                  {uiText('Nenhuma visita nos últimos 7 dias. Se o código já está no site, confira se a tag do GTM foi publicada.')}
                </p>
              )}
              {data.hosts.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">{uiText('Sites (30 dias)')}</p>
                  {data.hosts.map((h) => (
                    <p key={h.host} className="flex justify-between text-xs"><span className="truncate">{h.host}</span><span className="tabular-nums text-muted-foreground">{h.visits}</span></p>
                  ))}
                </div>
              )}
              {data.recent.length > 0 && (
                <div className="space-y-1">
                  <p className="text-xs font-medium">{uiText('Últimas visitas')}</p>
                  {data.recent.map((v, i) => (
                    <div key={i} className="flex items-center justify-between gap-2 border-t py-1 text-xs">
                      <div className="min-w-0">
                        <p className="truncate">{visitSource(v)}</p>
                        <p className="text-muted-foreground">{fmt(v.at)}</p>
                      </div>
                      {v.linked && <Badge variant="outline" className="shrink-0 text-[10px]">{uiText('virou contato')}</Badge>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </MarketingLayout>
  );
}
