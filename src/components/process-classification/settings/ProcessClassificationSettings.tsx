import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
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
import { useProcessClassificationEnabled } from '../useProcessClassificationEnabled';
import { dataHora } from '../formato';
import { tabelaClassificacao } from '../api';
import { CalibracaoTab } from './calibracao/CalibracaoTab';
import { LinkClassificacoes } from '../LinkClassificacoes';

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
    <div className="space-y-4">
    <LinkClassificacoes />
    <Tabs defaultValue={podeGeral ? 'geral' : 'calibracao'}>
      <TabsList>
        {podeGeral && <TabsTrigger value="geral">Geral</TabsTrigger>}
        <TabsTrigger value="calibracao" disabled={!podeCalibrar}>
          {!podeCalibrar && <Lock className="mr-1 h-3.5 w-3.5" />} Calibração
        </TabsTrigger>
      </TabsList>
      {podeGeral && <TabsContent value="geral"><Geral organizationId={organizationId} podeVerVersao={podeCalibrar} /></TabsContent>}
      {podeCalibrar && <TabsContent value="calibracao"><CalibracaoTab organizationId={organizationId} /></TabsContent>}
    </Tabs>
    </div>
  );
}

function useVersaoPublicada(organizationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ['process-classification-published', organizationId],
    enabled,
    queryFn: async (): Promise<VersaoPublicada | null> => {
      const { data, error } = await tabelaClassificacao('classification_calibration_versions')
        .select('number, published_at, note').eq('organization_id', organizationId).eq('status', 'published').maybeSingle();
      if (error) throw error;
      return data;
    },
  });
}

const MODO: Record<string, string> = {
  off: 'Desligado: nenhuma regra de fechamento é cobrada.',
  monitor: 'Monitorar sem bloquear: a classificação aparece como pendência, mas o ganho continua permitido.',
  enforce: 'Aplicar e bloquear: sem classificação, a oportunidade não pode ir para ganha.',
};

function Geral({ organizationId, podeVerVersao }: { organizationId: string; podeVerVersao: boolean }) {
  const qc = useQueryClient();
  const moduloLigado = useProcessClassificationEnabled();
  // A exigência mora na política de fechamento (mesma regra das Configurações de oportunidade e dos documentos).
  const { data, isLoading } = useQuery({
    queryKey: settingsKey(organizationId),
    queryFn: async (): Promise<{ exigir: boolean; modo: string; limite: number | null }> => {
      const [pol, cfg] = await Promise.all([
        supabase.from('opportunity_close_policies').select('mode, require_process_classification').eq('organization_id', organizationId).maybeSingle(),
        tabelaClassificacao('process_classification_settings').select('daily_limit_per_opportunity').eq('organization_id', organizationId).maybeSingle(),
      ]);
      if (pol.error) throw pol.error;
      return { exigir: !!pol.data?.require_process_classification, modo: pol.data?.mode ?? 'off', limite: cfg.data ? cfg.data.daily_limit_per_opportunity : 2 /* sem linha = padrão do servidor */ };
    },
  });
  const { data: versao } = useVersaoPublicada(organizationId, podeVerVersao);
  const [exigir, setExigir] = useState(false);
  const [limite, setLimite] = useState('');
  const [salvando, setSalvando] = useState(false);
  useEffect(() => {
    if (!data) return;
    setExigir(data.exigir);
    setLimite(data.limite ? String(data.limite) : '');
  }, [data]);

  const limiteNum = limite.trim() === '' ? null : Number(limite);
  const limiteInvalido = limiteNum !== null && !(Number.isInteger(limiteNum) && limiteNum >= 1);
  const mudouExigir = !!data && exigir !== data.exigir;
  const mudouLimite = !!data && limiteNum !== data.limite;

  const salvar = async () => {
    setSalvando(true);
    const erros: unknown[] = [];
    if (mudouExigir) {
      const { error } = await supabase.from('opportunity_close_policies')
        .upsert({ organization_id: organizationId, require_process_classification: exigir }, { onConflict: 'organization_id' });
      if (error) erros.push(error);
    }
    if (mudouLimite) {
      const { error } = await supabase.rpc('pc_update_settings' as never, { _org: organizationId, _limit_per_opportunity: limiteNum } as never);
      if (error) erros.push(error);
    }
    setSalvando(false);
    if (erros.length) return toast({ variant: 'destructive', description: 'Não foi possível salvar. Só quem gerencia Configurações pode alterar.' });
    toast({ description: 'Configurações salvas.' });
    qc.invalidateQueries({ queryKey: settingsKey(organizationId) });
  };

  if (isLoading || !data) return null;
  return (
    <div className="space-y-4 pt-2">
      {!moduloLigado && (
        <Alert><WarningCircle className="h-4 w-4" /><AlertDescription>O widget está desligado. As regras abaixo só valem depois de ligá-lo em Widgets.</AlertDescription></Alert>
      )}
      {podeVerVersao && versao === null && (
        <Alert variant="destructive"><WarningCircle className="h-4 w-4" /><AlertDescription>Sem calibração publicada: os vendedores não conseguem classificar e a exigência não é cobrada. Publique uma calibração na aba Calibração.</AlertDescription></Alert>
      )}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Regras da oportunidade</CardTitle>
          <CardDescription>Valem para todas as oportunidades da organização.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="space-y-2">
            <div className="flex items-start justify-between gap-4">
              <div>
                <Label htmlFor="pc-exigir" className="text-sm font-medium">Exigir classificação para marcar como ganha</Label>
                <p className="text-xs text-muted-foreground">Entra nas regras de fechamento, como os documentos obrigatórios.</p>
              </div>
              <Switch id="pc-exigir" checked={exigir} onCheckedChange={setExigir} />
            </div>
            {exigir && (
              <p className="rounded-md bg-muted p-2 text-xs">
                {MODO[data.modo] ?? MODO.off}{' '}
                <Link to="/settings/opportunity-close" className="text-primary hover:underline">Mudar o modo em Configurações de oportunidade</Link>
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pc-limite" className="text-sm font-medium">Limite de classificações por oportunidade (24 horas)</Label>
            <Input id="pc-limite" inputMode="numeric" className="max-w-[160px]" placeholder="Sem limite" value={limite} onChange={(e) => setLimite(e.target.value)} aria-invalid={limiteInvalido} />
            <p className={limiteInvalido ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {limiteInvalido ? 'Use um número inteiro a partir de 1, ou deixe vazio.' : 'Conta a classificação e as reclassificações depois de correção. Evita testar respostas na mesma oportunidade para descobrir a regra. Padrão: 2. Vazio = sem limite.'}
            </p>
          </div>
          <Button onClick={salvar} disabled={!(mudouExigir || mudouLimite) || limiteInvalido || salvando}>Salvar</Button>
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
