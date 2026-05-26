import { useEffect, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { usePermissions } from '@/hooks/usePermissions';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { SpinnerGap, Sparkle, ShieldCheck, ChartLine, Microphone, Gear, Key } from '@phosphor-icons/react';
import { toast } from 'sonner';
import { AIProvidersSettings } from './AIProvidersSettings';

type TranscriptionMode = 'all_whatsapp' | 'leads_only' | 'agents_only' | 'open_deals_only' | 'off';

interface Settings {
  organization_id: string;
  capture: {
    whatsapp: boolean; inbound: boolean; outbound: boolean;
    only_open_deals: boolean; ignore_internal_notes: boolean;
  };
  transcription: {
    mode: TranscriptionMode;
    include_lead_audio: boolean;
    include_seller_audio: boolean;
    max_audio_seconds: number;
  };
  behavior: {
    detect_objection: boolean; detect_buying_signal: boolean;
    detect_ghosting: boolean; detect_premature_lost: boolean;
    min_cadence_before_lost: { messages: number; days: number };
    ghosting_threshold_days: number;
  };
  privacy: {
    transcription_retention_days: number;
    org_opt_out: boolean;
  };
}

export function IntelligenceSettings() {
  const { organization } = useOrganization();
  const { permissions } = usePermissions();
  const canEdit = permissions.canManageSettings;
  const qc = useQueryClient();
  const orgId = organization?.id;

  const { data: settings, isLoading } = useQuery({
    queryKey: ['intelligence_settings', orgId],
    enabled: !!orgId,
    queryFn: async (): Promise<Settings | null> => {
      const { data, error } = await supabase
        .from('intelligence_settings')
        .select('*')
        .eq('organization_id', orgId!)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  const { data: overview } = useQuery({
    queryKey: ['intelligence_overview', orgId],
    enabled: !!orgId,
    queryFn: async () => {
      const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const [analyses, transcriptions, snapshots, ghosting] = await Promise.all([
        supabase.from('message_analyses').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!).gte('created_at', sevenDaysAgo),
        supabase.from('audio_transcriptions').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!).gte('created_at', sevenDaysAgo),
        supabase.from('opportunity_behavior_snapshot').select('final_status', { count: 'exact' })
          .eq('organization_id', orgId!),
        supabase.from('sales_events').select('id', { count: 'exact', head: true })
          .eq('organization_id', orgId!).eq('event_type', 'ghosting').gte('occurred_at', sevenDaysAgo),
      ]);
      const statuses = (snapshots.data ?? []) as Array<{ final_status: string | null }>;
      return {
        analyses7d: analyses.count ?? 0,
        transcriptions7d: transcriptions.count ?? 0,
        ghosting7d: ghosting.count ?? 0,
        won: statuses.filter((s) => s.final_status === 'won').length,
        lost: statuses.filter((s) => s.final_status === 'lost').length,
        open: statuses.filter((s) => s.final_status === 'open' || s.final_status == null).length,
      };
    },
  });

  const [local, setLocal] = useState<Settings | null>(null);
  useEffect(() => { if (settings) setLocal(structuredClone(settings)); }, [settings]);

  const mutation = useMutation({
    mutationFn: async (patch: Partial<Settings>) => {
      const { error } = await supabase
        .from('intelligence_settings')
        .update(patch as any)
        .eq('organization_id', orgId!);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Configurações salvas');
      qc.invalidateQueries({ queryKey: ['intelligence_settings', orgId] });
    },
    onError: (e: any) => toast.error(`Erro ao salvar: ${e.message}`),
  });

  const dirty = useMemo(() => {
    return JSON.stringify(local) !== JSON.stringify(settings);
  }, [local, settings]);

  if (isLoading || !local) {
    return (
      <div className="flex items-center justify-center py-20">
        <SpinnerGap className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const save = () => {
    if (!local) return;
    mutation.mutate({
      capture: local.capture,
      transcription: local.transcription,
      behavior: local.behavior,
      privacy: local.privacy,
    } as any);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-semibold flex items-center gap-2">
          <Sparkle className="size-7 text-primary" weight="fill" />
          Seialz Intelligence
        </h1>
        {dirty && (
          <Button onClick={save} disabled={mutation.isPending || !canEdit}>
            {mutation.isPending ? 'Salvando...' : 'Salvar alterações'}
          </Button>
        )}
      </div>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="w-full justify-start overflow-x-auto">
          <TabsTrigger value="overview"><ChartLine className="size-4 mr-2" /> Visão Geral</TabsTrigger>
          <TabsTrigger value="capture"><Gear className="size-4 mr-2" /> Captura & Análise</TabsTrigger>
          <TabsTrigger value="transcription"><Microphone className="size-4 mr-2" /> Transcrição</TabsTrigger>
          <TabsTrigger value="behavior"><ShieldCheck className="size-4 mr-2" /> Regras Operacionais</TabsTrigger>
          <TabsTrigger value="byok"><Key className="size-4 mr-2" /> Chaves (BYOK)</TabsTrigger>
        </TabsList>

        {/* OVERVIEW */}
        <TabsContent value="overview" className="space-y-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-base text-muted-foreground leading-relaxed">
                <span className="text-foreground font-medium">Descobrir padrões reais de fechamento, </span>
                evitar leads perdidos cedo demais e treinar agentes de IA com base nos melhores vendedores.
              </p>
            </CardContent>
          </Card>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <MetricCard label="Mensagens analisadas (7d)" value={overview?.analyses7d ?? '—'} />
            <MetricCard label="Áudios transcritos (7d)" value={overview?.transcriptions7d ?? '—'} />
            <MetricCard label="Alertas de ghosting (7d)" value={overview?.ghosting7d ?? '—'} />
            <MetricCard label="Deals com snapshot" value={(overview?.won ?? 0) + (overview?.lost ?? 0) + (overview?.open ?? 0)} />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Padrões de Fechamento</span>
                <Badge variant="secondary">Em breve</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground mb-4">
                Quando houver dados suficientes, esta área vai comparar won vs lost, top sellers vs low performers,
                áudio vs texto, tempos de resposta e cadência de follow-up. Por enquanto exibimos contagens brutas
                para confirmar que a coleta está rodando.
              </p>
              <div className="grid grid-cols-3 gap-3">
                <MiniStat label="Ganhos" value={overview?.won ?? 0} />
                <MiniStat label="Perdidos" value={overview?.lost ?? 0} />
                <MiniStat label="Em aberto" value={overview?.open ?? 0} />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Kill switch</CardTitle></CardHeader>
            <CardContent>
              <ToggleRow
                label="Desabilitar Intelligence nesta organização"
                description="Pausa transcrição, análise e detecções comportamentais."
                checked={local.privacy.org_opt_out}
                disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, privacy: { ...local.privacy, org_opt_out: v } })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* CAPTURE */}
        <TabsContent value="capture" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>O que analisar</CardTitle></CardHeader>
            <CardContent className="space-y-1">
              <ToggleRow label="WhatsApp" description="Analisar conversas do WhatsApp."
                checked={local.capture.whatsapp} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, capture: { ...local.capture, whatsapp: v } })} />
              <ToggleRow label="Mensagens recebidas (inbound)" description="Analisar o que o lead escreve."
                checked={local.capture.inbound} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, capture: { ...local.capture, inbound: v } })} />
              <ToggleRow label="Mensagens enviadas (outbound)" description="Analisar o que o vendedor escreve."
                checked={local.capture.outbound} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, capture: { ...local.capture, outbound: v } })} />
              <ToggleRow label="Somente deals em aberto" description="Reduz custo focando apenas em oportunidades ativas."
                checked={local.capture.only_open_deals} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, capture: { ...local.capture, only_open_deals: v } })} />
              <ToggleRow label="Ignorar notas internas" description="Não analisa notas privadas do CRM."
                checked={local.capture.ignore_internal_notes} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, capture: { ...local.capture, ignore_internal_notes: v } })} />
            </CardContent>
          </Card>
        </TabsContent>

        {/* TRANSCRIPTION */}
        <TabsContent value="transcription" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>O que transcrever</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <RadioGroup
                value={local.transcription.mode}
                onValueChange={(v) => setLocal({ ...local, transcription: { ...local.transcription, mode: v as TranscriptionMode } })}
                disabled={!canEdit}
                className="grid gap-2"
              >
                {([
                  ['all_whatsapp', 'Todos os áudios (recomendado)', 'Inclui lead e vendedor — coleta máxima.'],
                  ['leads_only', 'Apenas áudios de leads', 'Não transcreve o que o vendedor envia.'],
                  ['agents_only', 'Apenas áudios de vendedores', 'Útil para coaching de equipe.'],
                  ['open_deals_only', 'Apenas em deals em aberto', 'Reduz custo descartando deals fechados.'],
                  ['off', 'Desligado', 'Nenhum áudio será transcrito.'],
                ] as const).map(([val, label, desc]) => (
                  <label key={val} className="flex gap-3 items-start rounded-[6px] border border-border p-3 cursor-pointer hover:bg-muted/50">
                    <RadioGroupItem value={val} id={`tr-${val}`} className="mt-0.5" />
                    <div>
                      <div className="font-medium">{label}</div>
                      <div className="text-sm text-muted-foreground">{desc}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>

              <Separator />

              <ToggleRow label="Incluir áudio de lead" description="Transcreve áudios recebidos."
                checked={local.transcription.include_lead_audio} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, transcription: { ...local.transcription, include_lead_audio: v } })} />
              <ToggleRow label="Incluir áudio de vendedor" description="Transcreve áudios enviados."
                checked={local.transcription.include_seller_audio} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, transcription: { ...local.transcription, include_seller_audio: v } })} />

              <NumberRow
                label="Duração máxima (segundos)"
                description="Áudios maiores que isso são ignorados para controle de custo."
                value={local.transcription.max_audio_seconds}
                disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, transcription: { ...local.transcription, max_audio_seconds: v } })}
              />
              <NumberRow
                label="Retenção de transcrições (dias)"
                description="Transcrições mais antigas são apagadas automaticamente."
                value={local.privacy.transcription_retention_days}
                disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, privacy: { ...local.privacy, transcription_retention_days: v } })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* BEHAVIOR */}
        <TabsContent value="behavior" className="space-y-4 mt-4">
          <Card>
            <CardHeader><CardTitle>Detecções</CardTitle></CardHeader>
            <CardContent>
              <ToggleRow label="Detectar objeções" description="Marca trechos onde o lead resiste ou questiona."
                checked={local.behavior.detect_objection} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, behavior: { ...local.behavior, detect_objection: v } })} />
              <ToggleRow label="Detectar sinais de compra" description="Identifica quando o lead demonstra interesse forte."
                checked={local.behavior.detect_buying_signal} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, behavior: { ...local.behavior, detect_buying_signal: v } })} />
              <ToggleRow label="Detectar ghosting" description="Alerta quando o lead some por muitos dias."
                checked={local.behavior.detect_ghosting} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, behavior: { ...local.behavior, detect_ghosting: v } })} />
              <ToggleRow label="Detectar lost prematuro" description="Sinaliza quando o vendedor desiste cedo demais."
                checked={local.behavior.detect_premature_lost} disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, behavior: { ...local.behavior, detect_premature_lost: v } })} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Limites operacionais</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <NumberRow
                label="Mensagens mínimas antes de marcar lost"
                description="Vendedor não pode dar lost sem tentar pelo menos N vezes."
                value={local.behavior.min_cadence_before_lost.messages}
                disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, behavior: { ...local.behavior, min_cadence_before_lost: { ...local.behavior.min_cadence_before_lost, messages: v } } })}
              />
              <NumberRow
                label="Dias mínimos antes de marcar lost"
                description="Tempo mínimo de cadência antes de considerar o deal perdido."
                value={local.behavior.min_cadence_before_lost.days}
                disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, behavior: { ...local.behavior, min_cadence_before_lost: { ...local.behavior.min_cadence_before_lost, days: v } } })}
              />
              <NumberRow
                label="Threshold de ghosting (dias)"
                description="Dias sem inbound antes de gerar alerta de ghosting."
                value={local.behavior.ghosting_threshold_days}
                disabled={!canEdit}
                onChange={(v) => setLocal({ ...local, behavior: { ...local.behavior, ghosting_threshold_days: v } })}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* BYOK */}
        <TabsContent value="byok" className="mt-4">
          <AIProvidersSettings />
        </TabsContent>
      </Tabs>

      <p className="text-xs text-muted-foreground pt-4">
        Em breve: modelos por função, orçamento mensal, alertas de custo, anonimização PII, next best action, roteamento avançado.
      </p>
    </div>
  );
}

function MetricCard({ label, value }: { label: string; value: number | string }) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="text-xs uppercase tracking-wider text-muted-foreground mb-2">{label}</div>
        <div className="text-3xl font-mono">{value}</div>
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-[6px] bg-muted p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-2xl font-mono">{value}</div>
    </div>
  );
}

function ToggleRow({
  label, description, checked, onChange, disabled,
}: { label: string; description?: string; checked: boolean; disabled?: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3 border-b border-border last:border-0">
      <div className="space-y-0.5">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

function NumberRow({
  label, description, value, onChange, disabled,
}: { label: string; description?: string; value: number; disabled?: boolean; onChange: (v: number) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="space-y-0.5 flex-1">
        <Label className="text-sm font-medium">{label}</Label>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <Input
        type="number"
        className="w-28"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(parseInt(e.target.value || '0', 10))}
      />
    </div>
  );
}
