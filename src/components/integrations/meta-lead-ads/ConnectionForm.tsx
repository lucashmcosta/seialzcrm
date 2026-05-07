import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Info, CaretDown } from "@phosphor-icons/react";
import { toast } from "sonner";

interface Props {
  integrationId?: string;
  existing?: any;
  onSuccess: () => void;
}

export function ConnectionForm({ existing, onSuccess }: Props) {
  const { organization } = useOrganization();
  const ca = (existing?.connected_account || {}) as any;
  const [systemUserToken, setSystemUserToken] = useState("");
  const [businessId, setBusinessId] = useState(ca.business_id || "");
  const [appId, setAppId] = useState(ca.app_id || "");
  const [appSecret, setAppSecret] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const connect = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("Organização não encontrada");
      if (!systemUserToken) {
        throw new Error("Preencha o System User Token");
      }
      const body: any = {
        organization_id: organization.id,
        system_user_token: systemUserToken,
      };
      if (businessId) body.business_id = businessId;
      if (appId) body.app_id = appId;
      if (appSecret) body.app_secret = appSecret;

      const { data, error } = await supabase.functions.invoke("meta-lead-ads-connect", { body });
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
          Gere um System User Token no Business Manager → Configurações → System Users → Generate Token,
          com permissões <code className="text-xs bg-muted px-1 rounded">leads_retrieval</code>,{" "}
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

      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="system_user_token">System User Access Token *</Label>
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

        <div className="space-y-2">
          <Label htmlFor="business_id">Business ID (opcional)</Label>
          <Input
            id="business_id"
            value={businessId}
            onChange={(e) => setBusinessId(e.target.value)}
            placeholder="987654321..."
          />
        </div>

        <Collapsible open={advancedOpen} onOpenChange={setAdvancedOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="sm" className="w-full justify-between -ml-2">
              <span className="text-sm font-medium">Avançado (opcional)</span>
              <CaretDown
                className={`h-4 w-4 transition-transform ${advancedOpen ? "rotate-180" : ""}`}
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Para a maioria dos casos, basta o System User Token. App ID e Secret só são necessários
              se o seu app do Meta exigir <code className="bg-muted px-1 rounded">appsecret_proof</code>.
            </p>
            <div className="space-y-2">
              <Label htmlFor="app_id">App ID</Label>
              <Input id="app_id" value={appId} onChange={(e) => setAppId(e.target.value)} placeholder="123456789..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="app_secret">App Secret</Label>
              <Input
                id="app_secret"
                type="password"
                value={appSecret}
                onChange={(e) => setAppSecret(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      <div className="flex justify-end">
        <Button onClick={() => connect.mutate()} disabled={connect.isPending}>
          {connect.isPending ? "Validando..." : "Conectar conta"}
        </Button>
      </div>
    </Card>
  );
}
