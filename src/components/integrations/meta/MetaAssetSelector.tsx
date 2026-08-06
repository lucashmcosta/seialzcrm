import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/ui/checkbox';
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
  const { organization } = useOrganization();
  const [assets, setAssets] = useState<MetaAsset[]>([]);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    // cast: tabela meta_assets ainda não está em types.ts (migration aplicada no deploy da V1).
    const { data } = await (supabase as any)
      .from('meta_assets')
      .select('id,asset_type,external_id,name,selection_state')
      .eq('connection_id', connectionId)
      .order('asset_type');
    const list = (data ?? []) as MetaAsset[];
    setAssets(list);
    setSelected(Object.fromEntries(list.map((a) => [a.id, a.selection_state === 'selected'])));
    setLoading(false);
  }, [connectionId]);

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
      if (error) throw error;
      toast.success('Ativos da organização salvos.');
      onSaved?.();
      void load();
    } catch {
      toast.error('Não foi possível salvar a seleção.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <p className="text-sm text-muted-foreground">Carregando ativos…</p>;
  if (!assets.length) return <p className="text-sm text-muted-foreground">Nenhum ativo descoberto ainda. Aguarde a descoberta ou reconecte.</p>;

  return (
    <div className="space-y-4">
      {GROUPS.map(([type, label]) => {
        const items = assets.filter((a) => a.asset_type === type);
        if (!items.length) return null;
        return (
          <div key={type}>
            <h4 className="mb-1 text-sm font-medium">{label}</h4>
            <div className="space-y-1">
              {items.map((a) => (
                <label key={a.id} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={!!selected[a.id]}
                    onCheckedChange={(v) => setSelected((s) => ({ ...s, [a.id]: !!v }))}
                  />
                  <span>{a.name || a.external_id}</span>
                  <span className="text-xs text-muted-foreground">{a.external_id}</span>
                </label>
              ))}
            </div>
          </div>
        );
      })}
      <Button type="button" color="primary" size="sm" disabled={saving} onClick={() => void save()}>
        {saving ? 'Salvando…' : 'Salvar seleção'}
      </Button>
    </div>
  );
}
