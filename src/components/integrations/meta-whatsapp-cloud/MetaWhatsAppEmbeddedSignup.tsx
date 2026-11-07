import { uiError, uiText, useUiLocale } from '@/lib/ui-locale';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CircleNotch, WhatsappLogo } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from '@/hooks/useOrganization';
import { useFacebookSdk } from '@/hooks/useFacebookSdk';
import { parseEmbeddedSignupMessage, type EmbeddedSignupSession } from '@/lib/whatsapp-embedded-signup';

type Purpose = 'customer_service' | 'commercial';

async function readInvokeError(error: unknown): Promise<{ error?: string; message?: string } | null> {
  const ctx = (error as { context?: { json?: () => Promise<{ error?: string; message?: string }> } })?.context;
  if (!ctx?.json) return null;
  try {
    return await ctx.json();
  } catch {
    return null;
  }
}

// O evento de sessão e o callback do FB.login chegam em ordem não garantida;
// após o code, espera um pouco pelo evento (sem ele o backend usa o token).
function waitForSession(get: () => EmbeddedSignupSession | null, ms = 2500): Promise<EmbeddedSignupSession | null> {
  return new Promise((resolve) => {
    const start = Date.now();
    const tick = () => {
      const s = get();
      if (s?.wabaId || Date.now() - start >= ms) resolve(s);
      else setTimeout(tick, 100);
    };
    tick();
  });
}

/**
 * Conexão do WhatsApp pelo Embedded Signup (v4) usando o app da plataforma.
 * Fluxo: meta-connect-intent → FB.login(whatsapp_config_id, extras) + evento
 * WA_EMBEDDED_SIGNUP → meta-whatsapp-embedded-signup. O modo manual continua abaixo.
 */
export function MetaWhatsAppEmbeddedSignup({ onConnected }: { onConnected?: () => void }) {
  useUiLocale();
  const qc = useQueryClient();
  const { organization } = useOrganization();
  const { ensureSdk, login } = useFacebookSdk();
  const [purpose, setPurpose] = useState<Purpose>('customer_service');
  const [loading, setLoading] = useState(false);

  const handleConnect = async () => {
    if (!organization?.id || loading) return;
    setLoading(true);
    let session: EmbeddedSignupSession | null = null;
    const onMessage = (event: MessageEvent) => {
      const parsed = parseEmbeddedSignupMessage(event.origin, event.data);
      if (parsed) session = parsed;
    };
    window.addEventListener('message', onMessage);
    try {
      const { data: intent, error: intentErr } = await supabase.functions.invoke('meta-connect-intent', {
        body: { organization_id: organization.id },
      });
      if (intentErr || !intent?.intent_id || !intent?.app_id) {
        toast.error(uiText('Não foi possível iniciar a conexão.'));
        return;
      }
      if (!intent.whatsapp_config_id) {
        toast.error(uiText('Conexão do WhatsApp pela Meta ainda não configurada no servidor.'));
        return;
      }

      await ensureSdk(intent.app_id, intent.graph_version || 'v26.0');
      const res = await login(intent.whatsapp_config_id, { setup: {} });
      if (!res.code) {
        const s = session as EmbeddedSignupSession | null;
        // Erro reportado no popup (vem com error_message); texto da Meta não é exibido cru.
        if (s?.errorMessage) toast.error(uiError(s.errorMessage));
        else toast.message(uiText('Conexão com a Meta cancelada.'));
        return;
      }

      const s = await waitForSession(() => session);
      const { data, error } = await supabase.functions.invoke('meta-whatsapp-embedded-signup', {
        body: {
          organization_id: organization.id,
          intent_id: intent.intent_id,
          code: res.code,
          waba_id: s?.wabaId ?? null,
          phone_number_id: s?.phoneNumberId ?? null,
          business_id: s?.businessId ?? null,
          purpose,
        },
      });
      if (error || !data?.ok) {
        const payload = error ? await readInvokeError(error) : data;
        toast.error(uiError(payload?.message ?? uiText('Falha ao conectar o WhatsApp.')));
        return;
      }

      qc.invalidateQueries({ queryKey: ['organization-integrations'] });
      qc.invalidateQueries({ queryKey: ['meta-waba-connections'] });
      qc.invalidateQueries({ queryKey: ['meta-wabas'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-integration'] });
      qc.invalidateQueries({ queryKey: ['whatsapp-any-enabled'] });

      if (data.registration_status === 'failed') {
        toast.warning(uiText('WhatsApp conectado, mas o número ainda não foi registrado na Cloud API. Use "Verificar" ou refaça a conexão.'));
      } else {
        toast.success(uiText('WhatsApp conectado.'));
      }
      if (data.route_link_error) {
        toast.message(uiText('O número foi conectado, mas não foi vinculado à rota. Vincule em Configurações de WhatsApp.'));
      }
      onConnected?.();
    } catch {
      toast.error(uiText('Não foi possível conectar com a Meta agora.'));
    } finally {
      window.removeEventListener('message', onMessage);
      setLoading(false);
    }
  };

  return (
    <Card className="p-4 space-y-4">
      <div className="space-y-1">
        <h4 className="font-medium flex items-center gap-2">
          <WhatsappLogo className="h-4 w-4 text-green-600" weight="fill" />
          {uiText('Conectar pela Meta (recomendado)')}
        </h4>
        <p className="text-sm text-muted-foreground">
          {uiText('Abre o fluxo oficial da Meta: você escolhe ou cria a conta do WhatsApp Business e o número. Sem copiar tokens ou IDs.')}
        </p>
      </div>

      <div className="space-y-2">
        <Label>{uiText('Destino das conversas deste número')}</Label>
        <RadioGroup value={purpose} onValueChange={(v) => setPurpose(v as Purpose)} className="flex flex-wrap gap-4">
          <div className="flex items-center gap-2">
            <RadioGroupItem value="customer_service" id="es-p-cs" />
            <Label htmlFor="es-p-cs" className="font-normal cursor-pointer">{uiText('Atendimento (/inbox)')}</Label>
          </div>
          <div className="flex items-center gap-2">
            <RadioGroupItem value="commercial" id="es-p-com" />
            <Label htmlFor="es-p-com" className="font-normal cursor-pointer">{uiText('Comercial (/messages)')}</Label>
          </div>
        </RadioGroup>
      </div>

      <Button type="button" disabled={loading || !organization?.id} onClick={() => void handleConnect()}>
        {loading ? <CircleNotch className="animate-spin" /> : <WhatsappLogo weight="fill" />}
        {loading ? uiText('Conectando…') : uiText('Conectar WhatsApp com a Meta')}
      </Button>
    </Card>
  );
}
