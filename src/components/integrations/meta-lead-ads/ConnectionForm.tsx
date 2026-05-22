import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrganization } from "@/hooks/useOrganization";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Info, CaretDown, ArrowsClockwise, CheckCircle } from "@phosphor-icons/react";
import { toast } from "sonner";

interface Props {
  integrationId?: string;
  existing?: any;
  onSuccess: () => void;
}

export function ConnectionForm({ existing, onSuccess }: Props) {
  const { organization } = useOrganization();
  const qc = useQueryClient();
  const ca = (existing?.connected_account || {}) as any;
  const [systemUserToken, setSystemUserToken] = useState("");
  const [businessId, setBusinessId] = useState(ca.business_id || "");
  const [appId, setAppId] = useState(ca.app_id || "");
  const [appSecret, setAppSecret] = useState("");
  const [advancedOpen, setAdvancedOpen] = useState(false);

  const isConnected = !!existing?.is_enabled;

  // ===== Ads Manager state =====
  const { data: metaCred } = useQuery({
    queryKey: ["meta-cred", organization?.id],
    enabled: !!organization?.id && isConnected,
    queryFn: async () => {
      const { data } = await supabase.rpc("get_meta_credentials", {
        p_org_id: organization!.id,
      });
      return (data?.[0] || null) as any;
    },
  });

  const [selectedAdAccount, setSelectedAdAccount] = useState<string>("");
  const [enableAdsSync, setEnableAdsSync] = useState<boolean>(true);

  const currentAdAccountId: string | null = metaCred?.ad_account_id || null;
  const currentSyncEnabled: boolean = metaCred?.feature_ads_manager_sync !== false;

  const adAccountsQuery = useQuery({
    queryKey: ["meta-ad-accounts", organization?.id],
    enabled: !!organization?.id && isConnected,
    queryFn: async () => {
      const { data, error } = await supabase.functions.invoke(
        "meta-discover-ad-accounts",
        { body: { organization_id: organization!.id } },
      );
      if (error) throw error;
      if ((data as any)?.success === false) {
        throw new Error((data as any).error_message || "Falha ao listar contas");
      }
      return (data as any)?.ad_accounts || [];
    },
  });

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

  const saveAdsManager = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("Organização não encontrada");
      const accountId = selectedAdAccount || currentAdAccountId;
      if (!accountId) throw new Error("Selecione uma Ad Account");
      const account = (adAccountsQuery.data || []).find(
        (a: any) => a.id === accountId || a.account_id === accountId.replace("act_", ""),
      );
      const { data, error } = await supabase.functions.invoke("meta-ads-manager-save", {
        body: {
          organization_id: organization.id,
          ad_account_id: accountId,
          ad_account_name: account?.name || null,
          business_id: account?.business?.id || businessId || null,
          enable_sync: enableAdsSync,
        },
      });
      if (error) throw error;
      if ((data as any)?.success === false) {
        throw new Error((data as any).error || "Falha ao salvar");
      }
      return data;
    },
    onSuccess: () => {
      toast.success("Ads Manager configurado");
      qc.invalidateQueries({ queryKey: ["meta-cred"] });
      qc.invalidateQueries({ queryKey: ["org-integration"] });
    },
    onError: (e: any) => toast.error(e.message || "Falha ao salvar"),
  });

  const syncNow = useMutation({
    mutationFn: async () => {
      if (!organization?.id) throw new Error("Organização não encontrada");
      const [discover, insights] = await Promise.all([
        supabase.functions.invoke("meta-discover-ads-cron", {
          body: { organization_id: organization.id },
        }),
        supabase.functions.invoke("marketing-insights-sync-daily", {
          body: { organization_id: organization.id },
        }),
      ]);
      if (discover.error) throw discover.error;
      if (insights.error) throw insights.error;
      return { discover: discover.data, insights: insights.data };
    },
    onSuccess: () => toast.success("Sincronização disparada. Atualize /marketing em alguns segundos."),
    onError: (e: any) => toast.error(e.message || "Falha ao sincronizar"),
  });

  const effectiveSyncEnabled =
    saveAdsManager.isSuccess || saveAdsManager.isPending ? enableAdsSync : currentSyncEnabled;

  return (
    <div className="space-y-6">
      <Card className="p-6 space-y-6">
        <div>
          <h2 className="text-lg font-semibold">Conectar conta Meta</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Gere um System User Token no Business Manager → Configurações → System Users → Generate Token,
            com permissões <code className="text-xs bg-muted px-1 rounded">leads_retrieval</code>,{" "}
            <code className="text-xs bg-muted px-1 rounded">pages_show_list</code>,{" "}
            <code className="text-xs bg-muted px-1 rounded">pages_read_engagement</code>,{" "}
            <code className="text-xs bg-muted px-1 rounded">ads_read</code> e{" "}
            <code className="text-xs bg-muted px-1 rounded">business_management</code>.
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
            {connect.isPending ? "Validando..." : isConnected ? "Atualizar token" : "Conectar conta"}
          </Button>
        </div>
      </Card>

      {isConnected && (
        <Card className="p-6 space-y-4">
          <div>
            <h2 className="text-lg font-semibold">Ads Manager (módulo Marketing)</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Escolha a Ad Account que vai alimentar campanhas, criativos e insights na página{" "}
              <code className="text-xs bg-muted px-1 rounded">/marketing</code>.
            </p>
          </div>

          {currentAdAccountId && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">
                Atual: <code>{currentAdAccountId}</code>
                {currentSyncEnabled ? " · sync ativo" : " · sync desativado"}
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>Ad Account</Label>
            <Select
              value={selectedAdAccount || currentAdAccountId || ""}
              onValueChange={setSelectedAdAccount}
              disabled={adAccountsQuery.isLoading}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    adAccountsQuery.isLoading
                      ? "Carregando contas..."
                      : "Selecione uma Ad Account"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {(adAccountsQuery.data || []).map((acc: any) => (
                  <SelectItem key={acc.id} value={acc.id}>
                    {acc.name} ({acc.id})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {adAccountsQuery.isError && (
              <p className="text-xs text-destructive">
                {(adAccountsQuery.error as any)?.message || "Falha ao listar contas"}
              </p>
            )}
            {!adAccountsQuery.isLoading &&
              !adAccountsQuery.isError &&
              (adAccountsQuery.data || []).length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma Ad Account acessível por esse token. Verifique permissões{" "}
                  <code>ads_read</code> e <code>business_management</code>.
                </p>
              )}
          </div>

          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <p className="text-sm font-medium">Sincronizar campanhas e insights</p>
              <p className="text-xs text-muted-foreground">
                Liga os crons que populam <code>/marketing</code>.
              </p>
            </div>
            <Switch
              checked={effectiveSyncEnabled}
              onCheckedChange={setEnableAdsSync}
            />
          </div>

          <div className="flex flex-wrap gap-2 justify-end">
            <Button
              variant="outline"
              onClick={() => syncNow.mutate()}
              disabled={syncNow.isPending || !currentAdAccountId}
            >
              <ArrowsClockwise
                className={`h-4 w-4 mr-1 ${syncNow.isPending ? "animate-spin" : ""}`}
              />
              Sincronizar agora
            </Button>
            <Button
              onClick={() => saveAdsManager.mutate()}
              disabled={saveAdsManager.isPending || (!selectedAdAccount && !currentAdAccountId)}
            >
              {saveAdsManager.isPending ? "Salvando..." : "Salvar Ads Manager"}
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
