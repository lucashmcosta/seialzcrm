import { uiText, useUiLocale } from '@/lib/ui-locale';
import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { CircleNotch } from '@phosphor-icons/react';
import { toast } from 'sonner';

interface MetaAsset {
  id: string;
  asset_type: 'business' | 'ad_account' | 'page' | 'instagram_account';
  external_id: string;
  name: string | null;
  selection_state: 'discovered' | 'selected' | 'disabled';
}

const GROUPS: Array<[MetaAsset['asset_type'], string]> = [
  ['business', 'Negócios'],
  ['ad_account', 'Contas de anúncio'],
  ['page', 'Páginas'],
  ['instagram_account', 'Instagram'],
];

// Seleção explícita de quais ativos pertencem à organização (só 'selected' entra em sync).
export function MetaAssetSelector({ connectionId, onSaved }: { connectionId: string; onSaved?: () => void }) {
  useUiLocale();
  const { organization } = useOrganization();
  const [assets, setAssets] = useState<MetaAsset[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Ativos já selecionados em outra org: a Meta lista tudo o que o usuário de sistema da
  // empresa enxerga, sem dizer de qual org é cada um. Ficam escondidos, mas acessíveis.
  const [elsewhere, setElsewhere] = useState<Set<string>>(new Set());
  const [showElsewhere, setShowElsewhere] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('meta_assets')
      .select('id,asset_type,external_id,name,selection_state')
      .eq('connection_id', connectionId)
      .order('asset_type');
    const list = (data ?? []) as MetaAsset[];
    // Se a checagem falhar, mostra tudo (como antes): nada fica inacessível.
    const inUse = organization?.id
      ? await supabase.rpc('rpc_meta_assets_in_use_elsewhere' as never, { p_org: organization.id, p_connection: connectionId } as never)
      : { data: [] };
    setElsewhere(new Set(((inUse.data ?? []) as unknown as Array<string | { rpc_meta_assets_in_use_elsewhere: string }>)
      .map((row) => typeof row === 'string' ? row : row.rpc_meta_assets_in_use_elsewhere)));
    setAssets(list);
    setSelected(Object.fromEntries(list.map((a) => [a.id, a.selection_state === 'selected'])));
    setLoading(false);
  }, [connectionId, organization?.id]);

  useEffect(() => { void load(); }, [load]);

  const save = async () => {
    if (!organization?.id || saving) return;
    setSaving(true);
    try {
      const selections = assets.map((a) => ({
        asset_id: a.id,
        selection_state: (selected[a.id] ? 'selected' : 'disabled') as 'selected' | 'disabled',
      }));
      const { error } = await supabase.functions.invoke('meta-connect-select-assets', {
        body: { organization_id: organization.id, connection_id: connectionId, selections },
      });
      if (error) {
        const detail = await (error as { context?: Response }).context?.clone?.().json?.().catch(() => null);
        if (detail?.error === 'routed_connection_no_access') {
          toast.error(uiText("A conexão em uso pela sincronização não tem acesso a um dos ativos marcados. Nada foi salvo."));
          return;
        }
        throw error;
      }
      toast.success(uiText("Ativos da organização salvos."));
      onSaved?.();
      void load();
    } catch {
      toast.error(uiText("Não foi possível salvar a seleção."));
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-2">
        {[0, 1, 2].map((i) => <Skeleton key={i} className="h-8 w-full" />)}
      </div>
    );
  }
  if (!assets.length) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-center text-sm text-muted-foreground">
        {uiText("Nenhum ativo descoberto ainda. Aguarde a descoberta ou reconecte.")}</div>
    );
  }

  // O que já está marcado nesta org nunca some, mesmo sendo usado em outra.
  const isHidden = (a: MetaAsset) => elsewhere.has(a.id) && !selected[a.id] && !showElsewhere;
  const hiddenCount = assets.filter((a) => elsewhere.has(a.id) && !selected[a.id]).length;

  return (
    <div className="space-y-4">
      {GROUPS.map(([type, label]) => {
        const items = assets.filter((a) => a.asset_type === type && !isHidden(a));
        if (!items.length) return null;
        return (
          <div key={type}>
            <h4 className="mb-1 text-xs font-medium uppercase tracking-wider text-muted-foreground">{uiText(label)}</h4>
            <div className="space-y-1">
              {items.map((a) => (
                <Label key={a.id} htmlFor={`asset-${a.id}`} className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm font-normal hover:bg-muted/50">
                  <Checkbox
                    id={`asset-${a.id}`}
                    checked={!!selected[a.id]}
                    onCheckedChange={(v) => setSelected((s) => ({ ...s, [a.id]: !!v }))}
                  />
                  <span>{a.name || a.external_id}</span>
                  <span className="text-xs text-muted-foreground">{a.external_id}</span>
                  {elsewhere.has(a.id) && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                      {uiText("Em uso em outra organização")}
                    </span>
                  )}
                </Label>
              ))}
            </div>
          </div>
        );
      })}
      {(hiddenCount > 0 || showElsewhere) && (
        <button
          type="button"
          className="block text-xs text-primary hover:underline"
          onClick={() => setShowElsewhere((v) => !v)}
        >
          {showElsewhere
            ? uiText("Esconder ativos em uso em outra organização")
            : `${uiText("Mostrar ativos em uso em outra organização")} (${hiddenCount})`}
        </button>
      )}
      <Button type="button" size="sm" disabled={saving} onClick={() => void save()}>
        {saving && <CircleNotch className="animate-spin" />}
        {saving ? uiText("Salvando…") : uiText("Salvar seleção")}
      </Button>
    </div>
  );
}
