// Gerador de links com UTM: o lead que chega pelo link cai na Origem certa sem digitar nada à mão.
import { useMemo, useState } from 'react';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { MarketingLayout } from '../_components/MarketingLayout';
import { CopyField } from '../_components/CopyField';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { LINK_PRESETS, buildTrackedLink, paramsString, type LinkKind } from '@/lib/trackedLink';

export default function MarketingLinks() {
  useUiLocale();
  const [kind, setKind] = useState<LinkKind>('meta_ads');
  const [url, setUrl] = useState('');
  const [campaign, setCampaign] = useState('');
  const [source, setSource] = useState('');
  const preset = LINK_PRESETS.find((p) => p.kind === kind)!;

  const params = useMemo(() => paramsString(kind, campaign, source), [kind, campaign, source]);
  const link = useMemo(() => buildTrackedLink(url, kind, campaign, source), [url, kind, campaign, source]);

  return (
    <MarketingLayout title={uiText('Links com UTM')}>
      <Card className="max-w-3xl space-y-4 p-5">
        <p className="text-sm text-muted-foreground">
          {uiText('Monte o link de cada divulgação. Quem chegar por ele já entra no Seialz com a origem certa.')}
        </p>
        <div className="space-y-1">
          <Label>{uiText('Onde o link vai ser usado')}</Label>
          <Select value={kind} onValueChange={(v) => { setKind(v as LinkKind); setSource(''); }}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {LINK_PRESETS.map((p) => <SelectItem key={p.kind} value={p.kind}>{uiText(p.label)}</SelectItem>)}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">{uiText(preset.help)}</p>
        </div>
        <div className="space-y-1">
          <Label>{uiText('Endereço da página')}</Label>
          <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://seusite.com.br/oferta" />
        </div>
        {!preset.macros && (
          <div className="grid gap-3 sm:grid-cols-2">
            {preset.askSource && (
              <div className="space-y-1">
                <Label>{uiText('Fonte')}</Label>
                <Input value={source} onChange={(e) => setSource(e.target.value)} placeholder={preset.askSource} />
              </div>
            )}
            <div className="space-y-1">
              <Label>{uiText('Nome da campanha')}</Label>
              <Input value={campaign} onChange={(e) => setCampaign(e.target.value)} placeholder={uiText('ex.: black-friday')} />
            </div>
          </div>
        )}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">{uiText('O lead vai aparecer como')}</span>
          <Badge variant="secondary">{uiText(preset.origin)}</Badge>
        </div>
        {preset.macros && <CopyField label={uiText('Parâmetros de URL (cole no anúncio)')} value={params} />}
        {link ? <CopyField label={uiText('Link completo')} value={link} />
          : url.trim() ? <p className="text-xs text-destructive">{uiText('Endereço inválido. Use algo como https://seusite.com.br/pagina')}</p> : null}
        <p className="text-xs text-muted-foreground">
          {uiText('A página precisa mandar esses dados para o Seialz: pelo chat do site ou por um formulário ligado ao Seialz.')}
        </p>
      </Card>
    </MarketingLayout>
  );
}
