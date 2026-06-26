// Service layer da integração Meta WhatsApp Cloud.
// Encapsula chamadas às edge functions. Dialog é apenas casca visual.

import { supabase } from "@/integrations/supabase/client";

export interface PlatformStatus {
  appSecretConfigured: boolean;
  verifyTokenConfigured: boolean;
  webhookActive: boolean;
}

export interface ConnectInput {
  organizationId: string;
  appId: string;
  wabaId: string;
  phoneNumberId: string;
  phoneE164: string;
  systemUserToken: string;
}

export interface ConnectResult {
  ok: true;
  organization_integration_id: string;
  endpoint_id: string;
  meta: {
    display_phone_number: string;
    verified_name?: string;
    quality_rating?: string;
    messaging_limit_tier?: string;
  };
}

export const metaWhatsAppService = {
  async getPlatformStatus(): Promise<PlatformStatus> {
    const { data, error } = await supabase.functions.invoke("meta-whatsapp-platform-status", {
      method: "GET",
    });
    if (error) throw error;
    return data as PlatformStatus;
  },

  async connect(input: ConnectInput): Promise<ConnectResult> {
    const { data, error } = await supabase.functions.invoke("meta-whatsapp-connect", {
      body: input,
    });
    if (error) {
      const fnError = (data ?? {}) as any;
      const message = fnError?.error || error.message || "connect_failed";
      throw new Error(message);
    }
    if ((data as any)?.error) {
      throw new Error((data as any).error);
    }
    return data as ConnectResult;
  },

  async disconnect(organizationId: string): Promise<void> {
    const { error } = await supabase.functions.invoke("meta-whatsapp-disconnect", {
      body: { organizationId },
    });
    if (error) throw error;
  },

  async verify(organizationId: string) {
    const { data, error } = await supabase.functions.invoke("meta-whatsapp-verify", {
      body: { organizationId },
    });
    if (error) throw error;
    return data;
  },
};
