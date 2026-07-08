// Service layer da integração Meta WhatsApp Cloud.
// Encapsula chamadas às edge functions. Dialog é apenas casca visual.

import { supabase } from "@/integrations/supabase/client";


export interface ConnectInput {
  organizationId: string;
  appId: string;
  wabaId: string;
  phoneNumberId: string;
  phoneE164: string;
  systemUserToken: string;
  appSecret?: string;
  verifyToken?: string;
  skipMetaValidation?: boolean;
  /**
   * 'primary' (default) → comportamento original (configura/atualiza a integração).
   * 'additional' → adiciona apenas um novo endpoint na MESMA WABA já conectada.
   * 'add_waba' → PR1-B: cria NOVA integração Meta reutilizando meta_app_credentials.
   */
  mode?: "primary" | "additional" | "add_waba";
  endpointPurpose?: "commercial" | "customer_service" | "vendor_personal" | "other";
  displayName?: string;
}

export interface AddWabaInput {
  organizationId: string;
  wabaId: string;
  phoneNumberId: string;
  phoneE164: string;
  displayName: string;
  endpointPurpose?: "commercial" | "customer_service" | "vendor_personal" | "other";
  skipMetaValidation?: boolean;
}

export interface AddWabaResult {
  ok: true;
  mode: "add_waba";
  organization_integration_id: string;
  endpoint_id: string;
  meta_credentials_id: string;
  meta_waba_id: string;
  display_name: string;
  meta: {
    display_phone_number: string;
    verified_name?: string | null;
    quality_rating?: string | null;
    messaging_limit_tier?: string | null;
  };
}

export class WabaAlreadyRegisteredError extends Error {
  code = "waba_already_registered";
  info: { existing_organization_integration_id: string; existing_display_name?: string | null };
  constructor(info: WabaAlreadyRegisteredError["info"]) {
    super("Esta WABA já está cadastrada nesta organização.");
    this.name = "WabaAlreadyRegisteredError";
    this.info = info;
  }
}

export class UniqueConstraintBlockedError extends Error {
  code = "unique_constraint_blocked";
  constructor() {
    super("Multi-WABA está pronto no backend, mas requer M3 (remoção do unique legado) para inserir a 2ª WABA da organização.");
    this.name = "UniqueConstraintBlockedError";
  }
}


export interface MigrateInput {
  organizationId: string;
  existingEndpointId: string;
  provider?: "meta_cloud_api";
  appId?: string;
  wabaId: string;
  phoneNumberId: string;
  phoneE164: string;
  systemUserToken?: string;
  appSecret?: string;
  verifyToken?: string;
  endpointPurpose?: "commercial" | "customer_service" | "vendor_personal" | "other";
  displayName?: string;
  migrationReason?: string;
}

export interface MigrateResult {
  ok: true;
  mode: "migrate" | "migrate_dry_run";
  migrationApplied: boolean;
  endpointId: string;
  before: Record<string, unknown>;
  after: Record<string, unknown>;
  meta: {
    display_phone_number: string;
    verified_name?: string | null;
    quality_rating?: string | null;
    messaging_limit_tier?: string | null;
  };
}

export interface EndpointAlreadyRegisteredInfo {
  existing_endpoint_id: string;
  existing_provider: string;
  existing_sender_sid: string | null;
}

export class EndpointAlreadyRegisteredError extends Error {
  code = "endpoint_address_already_registered";
  info: EndpointAlreadyRegisteredInfo;
  constructor(info: EndpointAlreadyRegisteredInfo) {
    super("Já existe um endpoint WhatsApp com este número nesta organização.");
    this.name = "EndpointAlreadyRegisteredError";
    this.info = info;
  }
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

export class MetaWhatsAppValidationError extends Error {
  code = "meta_validation_failed";
  metaError?: { message?: string; code?: number; error_subcode?: number; fbtrace_id?: string };

  constructor(metaError?: MetaWhatsAppValidationError["metaError"]) {
    super("A Meta recusou a validação deste Phone Number ID com o token informado.");
    this.name = "MetaWhatsAppValidationError";
    this.metaError = metaError;
  }
}

async function readFunctionError(error: unknown, data: unknown) {
  if (data && typeof data === "object") return data as Record<string, any>;

  const context = (error as any)?.context;
  if (context && typeof context.json === "function") {
    try {
      return await context.clone().json();
    } catch {
      return null;
    }
  }

  return null;
}

async function invokeMigrate(
  body: MigrateInput & { mode: "migrate" | "migrate_dry_run" },
): Promise<MigrateResult> {
  const { data, error } = await supabase.functions.invoke("meta-whatsapp-connect", { body });
  if (error) {
    const fnError = await readFunctionError(error, data);
    if (fnError?.error === "meta_validation_failed") {
      throw new MetaWhatsAppValidationError(fnError.meta_error);
    }
    const msg = fnError?.error || error.message || "migrate_failed";
    const e = new Error(msg) as Error & { details?: unknown };
    e.details = fnError;
    throw e;
  }
  if ((data as any)?.error) {
    throw new Error((data as any).error);
  }
  return data as MigrateResult;
}


export const metaWhatsAppService = {
  async connect(input: ConnectInput): Promise<ConnectResult> {
    const { data, error } = await supabase.functions.invoke("meta-whatsapp-connect", {
      body: input,
    });
    if (error) {
      const fnError = await readFunctionError(error, data);
      if (fnError?.error === "meta_validation_failed") {
        throw new MetaWhatsAppValidationError(fnError.meta_error);
      }
      if (fnError?.error === "endpoint_address_already_registered") {
        throw new EndpointAlreadyRegisteredError({
          existing_endpoint_id: fnError.existing_endpoint_id,
          existing_provider: fnError.existing_provider,
          existing_sender_sid: fnError.existing_sender_sid ?? null,
        });
      }
      const message = fnError?.error || error.message || "connect_failed";
      throw new Error(message);
    }
    if ((data as any)?.error) {
      if ((data as any).error === "meta_validation_failed") {
        throw new MetaWhatsAppValidationError((data as any).meta_error);
      }
      throw new Error((data as any).error);
    }
    return data as ConnectResult;
  },

  async migrate(input: MigrateInput): Promise<MigrateResult> {
    return await invokeMigrate({ ...input, mode: "migrate" });
  },

  async migrateDryRun(input: MigrateInput): Promise<MigrateResult> {
    return await invokeMigrate({ ...input, mode: "migrate_dry_run" });
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

  async syncTemplates(organizationId: string): Promise<{
    success: boolean;
    synced: number;
    total: number;
    approved: number;
    by_status: Record<string, number>;
  }> {
    const { data, error } = await supabase.functions.invoke("meta-whatsapp-templates-sync", {
      body: { organizationId },
    });
    if (error) throw error;
    if ((data as any)?.error) throw new Error((data as any).error);
    return data as any;
  },

  async createTemplate(input: {
    organizationId: string;
    name: string;
    language: string;
    category: string;
    body: string;
    header?: string;
    footer?: string;
    variables?: { key: string; name: string; example: string }[];
    buttons?: { id: string; title: string }[];
  }): Promise<{ success: true; id: string; meta_template_id: string | null; status: string }> {
    const { data, error } = await supabase.functions.invoke(
      "meta-whatsapp-templates-create",
      { body: input },
    );
    if (error) {
      const fnError = await readFunctionError(error, data);
      const msg = fnError?.message || fnError?.error || error.message || "create_failed";
      throw new Error(msg);
    }
    if ((data as any)?.error) {
      throw new Error((data as any).message || (data as any).error);
    }
    return data as any;
  },
};
