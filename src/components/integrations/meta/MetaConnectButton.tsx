import { uiError } from '@/lib/ui-locale';
import { uiText, useUiLocale } from '@/lib/ui-locale';
import { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { CircleNotch, FacebookLogo } from '@phosphor-icons/react';
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
  useUiLocale();
  const { organization } = useOrganization();
  const { ensureSdk, login } = useFacebookSdk();
  const [loading, setLoading] = useState(false);

  const busy = useRef(false);

  // 3) troca do code no backend. Usada tanto no fluxo normal quanto quando o
  // callback do SDK chega atrasado (depois do watchdog liberar o botão).
  const exchangeCode = async (orgId: string, intentId: string, code: string) => {
    const { data: conn, error: connErr } = await supabase.functions.invoke(
      'meta-connect',
      { body: { organization_id: orgId, code, intent_id: intentId } },
    );
    if (connErr || !conn?.success) {
      toast.error(uiText("Falha ao confirmar a conexão com a Meta."));
      return;
    }
    toast.success(uiText("Conta Meta conectada. Agora selecione os ativos da organização."));
    onConnected?.(conn.connection_id);
  };

  const handleConnect = async () => {
    if (!organization?.id || busy.current) return;
    const orgId = organization.id;
    busy.current = true;
    setLoading(true);
    try {
      // 1) intent (backend devolve app_id/config_id/graph_version — fonte única)
      const { data: intent, error: intentErr } = await supabase.functions.invoke(
        'meta-connect-intent',
        { body: { organization_id: orgId } },
      );
      if (intentErr) {
        const code = await readInvokeError(intentErr);
        toast.error(uiError(code === 'facebook_not_configured'
          ? uiText("Integração Meta ainda não configurada no servidor.")
          : uiText("Não foi possível iniciar a conexão.")));
        return;
      }
      if (!intent?.intent_id || !intent?.app_id || !intent?.config_id) {
        toast.error(uiText("Integração Meta incompleta (app_id/config_id ausente)."));
        return;
      }

      // 2) SDK + login for business. O watchdog libera o botão se o popup for
      // fechado/finalizado sem o SDK chamar o callback.
      await ensureSdk(intent.app_id, intent.graph_version || 'v25.0');
      const res = await login(intent.config_id, undefined, {
        onLateResult: (late) => {
          if (!late.code || busy.current) return;
          busy.current = true;
          setLoading(true);
          void exchangeCode(orgId, intent.intent_id, late.code)
            .catch(() => toast.error(uiText("Não foi possível conectar com o Facebook agora.")))
            .finally(() => { busy.current = false; setLoading(false); });
        },
      });
      if (!res.code) {
        if (res.status !== 'connected') toast.message(uiText("Login do Facebook cancelado."));
        return;
      }

      await exchangeCode(orgId, intent.intent_id, res.code);
    } catch {
      toast.error(uiText("Não foi possível conectar com o Facebook agora."));
    } finally {
      busy.current = false;
      setLoading(false);
    }
  };

  return (
    <Button type="button" disabled={loading} onClick={() => void handleConnect()}>
      {loading ? <CircleNotch className="animate-spin" /> : <FacebookLogo weight="fill" />}
      {loading ? uiText("Conectando…") : uiText("Continuar com Facebook")}
    </Button>
  );
}
