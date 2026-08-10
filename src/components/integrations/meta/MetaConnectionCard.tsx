import { useCallback, useEffect, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOrganization } from '@/hooks/useOrganization';
import { supabase } from '@/integrations/supabase/client';
import { MetaConnectButton } from '@/components/integrations/meta/MetaConnectButton';
import { MetaAssetSelector } from '@/components/integrations/meta/MetaAssetSelector';

interface Conn {
  id: string;
  status: string;
  token_type: string;
  authorizing_meta_user_name: string | null;
  created_at: string;
}

// Card canônico "Conexão Meta" — OAuth (Login for Business) + seleção de ativos.
export function MetaConnectionCard() {
  const { organization } = useOrganization();
  const [conn, setConn] = useState<Conn | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    const { data } = await supabase
      .from('meta_connections')
      .select('id,status,token_type,authorizing_meta_user_name,created_at')
      .eq('organization_id', organization.id)
      .order('created_at', { ascending: false })
      .limit(1);
    setConn((data?.[0] as Conn) ?? null);
    setLoading(false);
  }, [organization?.id]);

  useEffect(() => { void load(); }, [load]);

  return (
    <Card className="p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-base font-semibold">Conexão Meta (Ads + Orgânico)</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Conecte a conta Meta do cliente via Facebook para Performance de anúncios e leitura
            orgânica de Páginas e Instagram. Depois selecione os ativos da organização.
          </p>
        </div>
        <MetaConnectButton onConnected={() => void load()} />
      </div>
      {!loading && conn && (
        <div className="mt-4 space-y-3 border-t pt-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant={conn.status === 'connected' ? 'default' : 'secondary'}>
              {conn.status === 'connected' ? 'Conectado' : conn.status}
            </Badge>
            {conn.authorizing_meta_user_name && <span>autorizado por {conn.authorizing_meta_user_name}</span>}
            <span>· token: {conn.token_type}</span>
          </div>
          <MetaAssetSelector connectionId={conn.id} />
        </div>
      )}
    </Card>
  );
}
