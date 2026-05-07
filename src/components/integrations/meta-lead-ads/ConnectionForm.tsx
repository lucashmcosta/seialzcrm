import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Info } from "@phosphor-icons/react";
import { toast } from "sonner";

interface Props {
  integrationId?: string;
  existing?: any;
  onSuccess: () => void;
}

export function ConnectionForm({ existing, onSuccess }: Props) {
  const { organization } = useOrganization();
  const ca = (existing?.connected_account || {}) as any;
  const [appId, setAppId] = useState(ca.app_id || "");
  const [appSecret, setAppSecret] = useState("");
  const [systemUserToken, setSystemUserToken] = useState("");
  const [businessId, setBusinessId] = useState(ca.business_id || "");

  const connect = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("Organização não encontrada");
      if (!appId || !appSecret || !systemUserToken) {
        throw new Error("Preencha App ID, App Secret e System User Token");
      }
      const { data, error } = await supabase.functions.invoke("meta-lead-ads-connect", {
        body: {
          organization_id: organization.id,
          app_id: appId,
          app_secret: appSecret,
          system_user_token: systemUserToken,
          business_id: businessId || undefined,
        },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      return data;
    },
    onSuccess: () => {
      toast.success("Conectado! Iniciamos a descoberta de páginas e formulários.");
      onSuccess();
    },
    onError: (e: any) => toast.error(e.message || "Falha ao conectar"),
  });

  return (
    <Card className="p-6 space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Conectar conta Meta</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Crie um System User no Business Manager com permissões{" "}
          <code className="text-xs bg-muted px-1 rounded">leads_retrieval</code>,{" "}
          <code className="text-xs bg-muted px-1 rounded">pages_show_list</code> e{" "}
          <code className="text-xs bg-muted px-1 rounded">pages_read_engagement</code>.
        </p>
      </div>

      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          As credenciais são criptografadas com AES-256-GCM antes de serem armazenadas.
        </AlertDescription>
      </Alert>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="app_id">App ID</Label>
          <Input id="app_id" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="123456789..." />
        </div>
        <div className="space-y-2">
          <Label htmlFor="business_id">Business ID (opcional)</Label>
          <Input
            id="business_id"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            placeholder="987654321..."
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="app_secret">App Secret</Label>
          <Input
            id="app_secret"
            type="password"
            value={appSecret}
            onChange={(e) => setAppSecret(e.target.value)}
            placeholder="••••••••"
          />
        </div>
        <div className="space-y-2 md:col-span-2">
          <Label htmlFor="system_user_token">System User Access Token</Label>
          <Input
            id="system_user_token"
            type="password"
            value={systemUserToken}
            onChange={(e) => setSystemUserToken(e.target.value)}
            placeholder="EAA..."
          />
          <p className="text-xs text-muted-foreground">
            Recomendado: token de longa duração (60 dias) ou perpétuo do System User.
          </p>
        </div>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
          {connect.isPending ? "Validando..." : "Conectar conta"}
        </Button>
      </div>
    </Card>
  );
}
