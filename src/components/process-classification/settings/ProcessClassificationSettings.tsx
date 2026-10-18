import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, WarningCircle } from '@phosphor-icons/react';
import { supabase } from '@/integrations/supabase/client';
import { usePermissions, canV2 } from '@/hooks/usePermissions';
import { toast } from '@/hooks/use-toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useProcessClassificationEnabled } from '../ProcessClassificationSlot';
import { dataHora } from '../formato';

interface Configuracao { require_classification_for_won: boolean; daily_limit_per_seller: number | null }
interface VersaoPublicada { number: number; published_at: string; note: string | null }

const settingsKey = (org: string) => ['process-classification-settings', org] as const;

/** Configurações do widget "Classificação do processo" (/settings/widgets/process_classification). */
export default function ProcessClassificationSettings({ organizationId }: { organizationId: string }) {
  const { permissions, loading } = usePermissions();
  const podeGeral = permissions.canManageSettings;
  const podeCalibrar = canV2(permissions, 'administracao.calibrar_classificacao', false)
    || canV2(permissions, 'administracao.publicar_calibracao', false);

  if (loading) return null;
  if (!podeGeral && !podeCalibrar) {
    return <p className="text-sm text-muted-foreground">Você não tem permissão para configurar este widget.</p>;
  }
  return (
    <Tabs defaultValue={podeGeral ? 'geral' : 'calibracao'}>
      <TabsList>
        {podeGeral && <TabsTrigger value="geral">Geral</TabsTrigger>}
        <TabsTrigger value="calibracao" disabled={!podeCalibrar}>
          {!podeCalibrar && <Lock className="mr-1 h-3.5 w-3.5" />} Calibração
        </TabsTrigger>
      </TabsList>
      {podeGeral && <TabsContent value="geral"><Geral organizationId={organizationId} podeVerVersao={podeCalibrar} /></TabsContent>}
      {podeCalibrar && <TabsContent value="calibracao"><Calibracao organizationId={organizationId} /></TabsContent>}
    </Tabs>
  );
}

function useVersaoPublicada(organizationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['process-classification-published', organizationId],
    enabled,
    queryFn: async (): Promise<VersaoPublicada | null> => {
      const { data, error } = await (supabase as any).from('classification_calibration_versions')
        .select('number, published_at, note').eq('organization_id', organizationId).eq('status', 'published').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

function Geral({ organizationId, podeVerVersao }: { organizationId: string; podeVerVersao: boolean }) {
  const qc = useQueryClient();
  const moduloLigado = useProcessClassificationEnabled();
  const { data: config, isLoading } = useQuery({
    queryKey: settingsKey(organizationId),
    queryFn: async (): Promise<Configuracao> => {
      const { data, error } = await (supabase as any).from('process_classification_settings')
        .select('require_classification_for_won, daily_limit_per_seller').eq('organization_id', organizationId).maybeSingle();
      if (error) throw error;
      return data ?? { require_classification_for_won: true, daily_limit_per_seller: null };
    },
  });
  const { data: versao } = useVersaoPublicada(organizationId, podeVerVersao);
  const [exigir, setExigir] = useState(true);
  const [limite, setLimite] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!config) return;
    setExigir(config.require_classification_for_won);
    setLimite(config.daily_limit_per_seller ? String(config.daily_limit_per_seller) : '');
  }, [config]);

  const limiteNum = limite.trim() === '' ? null : Number(limite);
  const limiteInvalido = limiteNum !== null && !(Number.isInteger(limiteNum) && limiteNum >= 1);
  const mudou = !!config && (exigir !== config.require_classification_for_won || limiteNum !== config.daily_limit_per_seller);

  const salvar = async () => {
    setSalvando(true);
    const { error } = await supabase.rpc('pc_update_settings' as never, { _org: organizationId, _require_for_won: exigir, _daily_limit: limiteNum } as never);
    setSalvando(false);
    if (error) return toast({ variant: 'destructive', description: 'Não foi possível salvar. Só quem gerencia Configurações pode alterar.' });
    toast({ description: 'Configurações salvas.' });
    qc.invalidateQueries({ queryKey: settingsKey(organizationId) });
  };

  if (isLoading) return null;
  return (
    <div className="space-y-4 pt-2">
      {!moduloLigado && (
        <Alert><WarningCircle className="h-4 w-4" /><AlertDescription>O widget está desligado. As regras abaixo só valem depois de ligá-lo em Widgets.</AlertDescription></Alert>
      )}
      {podeVerVersao && versao === null && (
        <Alert variant="destructive"><WarningCircle className="h-4 w-4" /><AlertDescription>Sem calibração publicada: os vendedores não conseguem classificar e o bloqueio de ganhar não vale. Publique uma calibração na aba Calibração.</AlertDescription></Alert>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Regras da oportunidade</CardTitle>
          <CardDescription>Valem para todas as oportunidades da organização.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <Label htmlFor="pc-exigir" className="text-sm font-medium">Exigir classificação para marcar como ganha</Label>
              <p className="text-xs text-muted-foreground">Sem classificação, a oportunidade não pode ir para ganha (no Kanban, no detalhe e em lote).</p>
            </div>
            <Switch id="pc-exigir" checked={exigir} onCheckedChange={setExigir} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-limite" className="text-sm font-medium">Limite de classificações por vendedor (24 horas)</Label>
            <Input id="pc-limite" inputMode="numeric" className="max-w-[160px]" placeholder="Sem limite" value={limite} onChange={(e) => setLimite(e.target.value)} aria-invalid={limiteInvalido} />
            <p className={limiteInvalido ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {limiteInvalido ? 'Use um número inteiro a partir de 1, ou deixe vazio.' : 'Evita que alguém classifique oportunidades de teste para descobrir a regra. Vazio = sem limite.'}
            </p>
          </div>
          <Button onClick={salvar} disabled={!mudou || limiteInvalido || salvando}>Salvar</Button>
        </CardContent>
      </Card>
      {podeVerVersao && versao && (
        <p className="text-xs text-muted-foreground">
          Calibração em uso: v{versao.number}, publicada em {dataHora(versao.published_at)}{versao.note ? ` — "${versao.note}"` : ''}.
        </p>
      )}
    </div>
  );
}

/** Aba Calibração (só Admin por padrão). A edição com versões, simulador e prévia de impacto chega na Fase 4. */
function Calibracao({ organizationId }: { organizationId: string }) {
  const { data: versao, isLoading } = useVersaoPublicada(organizationId, true);
  if (isLoading) return null;
  return (
    <Card className="mt-2">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Calibração</CardTitle>
        <CardDescription>Chances, valores, faixas e comissões usados para classificar. Cada publicação vira uma versão que não muda mais.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {versao
          ? <p>Versão publicada: <strong>v{versao.number}</strong> ({dataHora(versao.published_at)}){versao.note ? ` — ${versao.note}` : ''}.</p>
          : <p>Nenhuma versão publicada.</p>}
        <p className="text-muted-foreground">Em breve aqui: editar o rascunho, simular um caso, ver o impacto antes de publicar, histórico de versões, importar e exportar.</p>
      </CardContent>
    </Card>
  );
}
