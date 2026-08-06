import { useState } from 'react';
import { Button } from '@/components/base/buttons/button';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useFacebookSdk } from '@/hooks/useFacebookSdk';
import { toast } from 'sonner';

async function readInvokeError(error: unknown): Promise<string | null> {
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string }> } })?.context;
  if (ctx?.json) {
    try {
      const payload = await ctx.json();
      return payload?.error ?? null;
    } catch {
      return null;
    }
  }
  return null;
}

// Botão canônico "Continuar com Facebook" (Login for Business).
// Fluxo: meta-connect-intent -> FB.login(config_id, code) -> meta-connect.
export function MetaConnectButton({ onConnected }: { onConnected?: (connectionId: string) => void }) {
  const { organization } = useOrganization();
  const { ensureSdk, login } = useFacebookSdk();
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!organization?.id || loading) return;
    setLoading(true);
    try {
      // 1) intent (backend devolve app_id/config_id/graph_version — fonte única)
      const { data: intent, error: intentErr } = await supabase.functions.invoke(
        'meta-connect-intent',
        { body: { organization_id: organization.id } },
      );
      if (intentErr) {
        const code = await readInvokeError(intentErr);
        toast.error(code === 'facebook_not_configured'
          ? 'Integração Meta ainda não configurada no servidor.'
          : 'Não foi possível iniciar a conexão.');
        return;
      }
      if (!intent?.intent_id || !intent?.app_id || !intent?.config_id) {
        toast.error('Integração Meta incompleta (app_id/config_id ausente).');
        return;
      }

      // 2) SDK + login for business
      await ensureSdk(intent.app_id, intent.graph_version || 'v25.0');
      const res = await login(intent.config_id);
      if (!res.code) {
        if (res.status !== 'connected') toast.message('Login do Facebook cancelado.');
        return;
      }

      // 3) troca do code no backend
      const { data: conn, error: connErr } = await supabase.functions.invoke(
        'meta-connect',
        { body: { organization_id: organization.id, code: res.code, intent_id: intent.intent_id } },
      );
      if (connErr || !conn?.success) {
        toast.error('Falha ao confirmar a conexão com a Meta.');
        return;
      }
      toast.success('Conta Meta conectada. Agora selecione os ativos da organização.');
      onConnected?.(conn.connection_id);
    } catch {
      toast.error('Não foi possível conectar com o Facebook agora.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button type="button" color="primary" disabled={loading} onClick={() => void handleConnect()}>
      {loading ? 'Conectando…' : 'Continuar com Facebook'}
    </Button>
  );
}
