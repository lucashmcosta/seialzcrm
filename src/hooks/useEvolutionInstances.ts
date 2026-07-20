import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// ---- Types ----
export type EvolutionConnectionState = "open" | "connecting" | "close" | "unknown";

export interface EvolutionInstanceRow {
  id: string;
  organization_id: string;
  endpoint_id: string;
  instance_name: string;
  instance_id_remote: string | null;
  integration: string;
  last_known_state: EvolutionConnectionState | null;
  last_state_checked_at: string | null;
  last_qr_expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface EndpointLite {
  id: string;
  organization_id: string;
  display_name: string | null;
  external_address: string | null;
  provider: string | null;
  channel: string | null;
  status: string | null;
}

// ---- Query: list instances (admin scope) ----
// Auto-refresh a cada 5s para refletir atualizações vindas pelo webhook
// (last_known_state, last_qr_expires_at) sem intervenção manual.
export function useEvolutionInstances() {
  return useQuery({
    queryKey: ["evolution", "instances"],
    queryFn: async (): Promise<EvolutionInstanceRow[]> => {
      const { data, error } = await supabase
        .from("evolution_instances")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EvolutionInstanceRow[];
    },
    refetchInterval: 5000,
    refetchOnWindowFocus: true,
  });
}

export function useEvolutionEndpoints() {
  return useQuery({
    queryKey: ["evolution", "endpoints"],
    queryFn: async (): Promise<EndpointLite[]> => {
      const { data, error } = await supabase
        .from("communication_endpoints")
        .select("id,organization_id,display_name,external_address,provider,channel,status")
        .eq("provider", "evolution_api")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as EndpointLite[];
    },
  });
}

// ---- Manager op ----
type ManagerOp =
  | "fetch"
  | "create"
  | "delete"
  | "connect"
  | "logout"
  | "connectionState"
  | "webhookFind"
  | "webhookSet";

interface ManagerPayload {
  op: ManagerOp;
  organizationId?: string | null;
  instanceName?: string;
  qrcode?: boolean;
  webhook?: {
    enabled: boolean;
    url: string;
    events: string[];
    webhookByEvents?: boolean;
    webhookBase64?: boolean;
  };
}

async function callManager<T = unknown>(payload: ManagerPayload): Promise<T> {
  const { data, error } = await supabase.functions.invoke(
    "evolution-instance-manager",
    { body: payload },
  );
  if (error) {
    // supabase-js wraps non-2xx as FunctionsHttpError; surface message.
    throw new Error(error.message || "Falha ao chamar evolution-instance-manager");
  }
  if (data && typeof data === "object" && "error" in (data as Record<string, unknown>)) {
    const err = data as { error: string; message?: string };
    throw new Error(err.message || err.error);
  }
  return data as T;
}

export function useEvolutionManager() {
  return { callManager };
}

// ---- Mutations ----
export function useConnectInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceName: string) =>
      callManager<{ pairingCode: string | null; base64: string | null; count: number | null }>(
        { op: "connect", instanceName },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evolution", "instances"] });
    },
  });
}

export function useLogoutInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceName: string) =>
      callManager<{ ok: true }>({ op: "logout", instanceName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evolution", "instances"] });
    },
  });
}

export function useDeleteInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceName: string) =>
      callManager<{ ok: true }>({ op: "delete", instanceName }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evolution", "instances"] });
      qc.invalidateQueries({ queryKey: ["evolution", "endpoints"] });
    },
  });
}

export function useConnectionState() {
  return useMutation({
    mutationFn: (instanceName: string) =>
      callManager<{ instanceName: string; state: EvolutionConnectionState }>(
        { op: "connectionState", instanceName },
      ),
  });
}

export function useWebhookSet() {
  return useMutation({
    mutationFn: (args: { instanceName: string; events?: string[] }) =>
      callManager<{ ok: true; events: string[] }>({
        op: "webhookSet",
        instanceName: args.instanceName,
        // A URL do webhook é construída no servidor com o secret injetado;
        // o frontend nunca vê nem transmite o secret.
        webhook: {
          enabled: true,
          url: "server-managed",
          events: args.events ?? [
            "CONNECTION_UPDATE",
            "QRCODE_UPDATED",
            "MESSAGES_UPSERT",
            "MESSAGES_UPDATE",
          ],
          webhookByEvents: false,
          webhookBase64: false,
        },
      }),
  });
}

export function useCreateInstance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (instanceName: string) =>
      callManager<{
        instanceName: string;
        instanceId: string | null;
        status: string | null;
        qrcode: { pairingCode: string | null; base64: string | null; count: number | null } | null;
      }>({ op: "create", instanceName, qrcode: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["evolution", "instances"] });
    },
  });
}
