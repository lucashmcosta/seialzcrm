import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Warning, CheckCircle, Info } from '@phosphor-icons/react';
import { metaWhatsAppService } from '@/services/metaWhatsAppService';

/**
 * Painel admin global de Meta WhatsApp Cloud.
 * Mostra status dos secrets globais. Os valores nunca são exibidos.
 * Para definir/rotacionar os secrets, use a tela de Secrets do projeto Lovable
 * (Settings → Secrets → META_WHATSAPP_APP_SECRET / META_WHATSAPP_VERIFY_TOKEN).
 */
export function MetaWhatsAppPlatformConfig() {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['meta-wa-platform-status-admin'],
    queryFn: () => metaWhatsAppService.getPlatformStatus(),
    refetchInterval: 15_000,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuração global da plataforma</CardTitle>
        <CardDescription>
          Os secrets globais pertencem à Seialz, não a uma organização específica. São consumidos pelo
          webhook (validação de assinatura e verify token).
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Row
          label="META_WHATSAPP_APP_SECRET"
          ok={!!data?.appSecretConfigured}
          description="App Secret do app Meta. Usado para validar X-Hub-Signature-256 dos webhooks e calcular appsecret_proof nas chamadas Graph."
        />
        <Row
          label="META_WHATSAPP_VERIFY_TOKEN"
          ok={!!data?.verifyTokenConfigured}
          description="Token de verificação usado no handshake GET do webhook (campo hub.verify_token)."
        />
        <Row
          label="Webhook"
          ok={!!data?.webhookActive}
          okLabel="Ativo"
          pendingLabel="Pendente"
          description="Fica ativo automaticamente quando os dois secrets acima estão configurados. Não requer redeploy."
        />

        {data && !data.webhookActive && (
          <Alert>
            <Warning className="h-4 w-4" />
            <AlertDescription className="space-y-1">
              <p>
                Defina os secrets globais em <strong>Lovable → Settings → Secrets</strong>. Após salvar,
                este painel atualiza sozinho em ~15s.
              </p>
              <p className="text-xs text-muted-foreground">
                Organizações já configuradas continuam podendo enviar; apenas o recebimento e callbacks
                ficam suspensos até a ativação global.
              </p>
            </AlertDescription>
          </Alert>
        )}

        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">
            URL do webhook a ser cadastrada no Meta Dashboard:
            <code className="ml-1 px-1 py-0.5 bg-muted rounded font-mono text-[11px] break-all">
              https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/meta-whatsapp-webhook
            </code>
          </AlertDescription>
        </Alert>

        <button
          onClick={() => refetch()}
          className="text-xs text-primary hover:underline"
          disabled={isLoading || isFetching}
        >
          Atualizar status
        </button>
      </CardContent>
    </Card>
  );
}

function Row({
  label, ok, okLabel = 'Configurado', pendingLabel = 'Pendente', description,
}: {
  label: string; ok: boolean; okLabel?: string; pendingLabel?: string; description?: string;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-2 border-b last:border-b-0">
      <div className="flex-1">
        <p className="text-sm font-medium font-mono">{label}</p>
        {description && <p className="text-xs text-muted-foreground mt-0.5">{description}</p>}
      </div>
      {ok ? (
        <Badge className="bg-green-600 text-white shrink-0">
          <CheckCircle className="h-3 w-3 mr-1" />
          {okLabel}
        </Badge>
      ) : (
        <Badge variant="outline" className="border-amber-500 text-amber-600 shrink-0">
          <Warning className="h-3 w-3 mr-1" />
          {pendingLabel}
        </Badge>
      )}
    </div>
  );
}
