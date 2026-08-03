import {
  corsPreflight,
  json,
  requireTelephonyUser,
} from "../_shared/telephony/auth.ts";
import { telephonyV2Enabled } from "../_shared/telephony/feature-flag.ts";
import {
  safeTwilioError,
  twilioAccountUrl,
  twilioApiContext,
  twilioRequest,
} from "../_shared/telephony/twilio-api.ts";

const KINDS: Record<string, string> = {
  local: "Local",
  mobile: "Mobile",
  toll_free: "TollFree",
  national: "National",
};

type CatalogBody = {
  action?: "search" | "regulatory" | "quote" | "purchase";
  isoCountry?: string;
  numberKind?: keyof typeof KINDS;
  contains?: string;
  phoneNumber?: string;
  numberType?: "company" | "user";
  assignedUserId?: string | null;
  missedCallOwnerUserId?: string;
  friendlyName?: string;
  addressSid?: string | null;
  bundleSid?: string | null;
  idempotencyKey?: string;
  purchaseIntentId?: string;
  confirmPhoneNumber?: string;
  confirmMonthlyPrice?: string | number | null;
};

interface AvailableNumber {
  phone_number: string;
  friendly_name?: string;
  iso_country?: string;
  capabilities?: Record<string, boolean>;
  address_requirements?: string;
}

interface PriceResponse {
  price_unit?: string;
  phone_number_prices?: Array<{
    number_type?: string;
    base_price?: string;
    current_price?: string;
  }>;
}

interface PurchasedNumber {
  sid: string;
  phone_number: string;
  friendly_name?: string;
  iso_country?: string;
  capabilities?: Record<string, boolean>;
}

function normalizedInput(body: CatalogBody) {
  const isoCountry = String(body.isoCountry || "").trim().toUpperCase();
  const numberKind = String(body.numberKind || "local") as keyof typeof KINDS;
  if (!/^[A-Z]{2}$/.test(isoCountry) || !KINDS[numberKind]) {
    throw json({ error: "invalid_country_or_number_kind" }, 400);
  }
  return { isoCountry, numberKind };
}

function requireManager(permissions: Record<string, boolean>) {
  if (permissions.can_manage_telephony !== true) {
    throw json({ error: "telephony_management_required" }, 403);
  }
}

async function pricing(
  twilio: Awaited<ReturnType<typeof twilioApiContext>>,
  isoCountry: string,
  kind: string,
) {
  const value = await twilioRequest<PriceResponse>(
    twilio,
    `https://pricing.twilio.com/v2/PhoneNumbers/Countries/${
      encodeURIComponent(isoCountry)
    }`,
  );
  const match = (value.phone_number_prices ?? []).find((row) =>
    String(row.number_type || "").toLowerCase().replace(/[- ]/g, "_") === kind
  );
  return {
    monthlyPrice: match?.current_price ?? match?.base_price ?? null,
    currency: value.price_unit ?? null,
  };
}

function pricesEqual(left: unknown, right: unknown): boolean {
  if (
    left === null || left === undefined || right === null || right === undefined
  ) {
    return left === right;
  }
  const a = Number(left);
  const b = Number(right);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) < 0.000001;
}

async function regulations(
  twilio: Awaited<ReturnType<typeof twilioApiContext>>,
  isoCountry: string,
  kind: string,
) {
  const regulatoryKind = kind.replaceAll("_", "-");
  try {
    const response = await twilioRequest<
      { results?: Array<Record<string, unknown>> }
    >(
      twilio,
      `https://numbers.twilio.com/v2/RegulatoryCompliance/Regulations?IsoCountry=${
        encodeURIComponent(isoCountry)
      }&NumberType=${encodeURIComponent(regulatoryKind)}&PageSize=20`,
    );
    return { requiresBundle: (response.results ?? []).length > 0 };
  } catch (error) {
    console.warn("[telephony-number-catalog] regulations lookup failed", error);
    // Failing closed is safer than purchasing a regulated number without its bundle.
    return { requiresBundle: true, lookupFailed: true };
  }
}

async function exactAvailable(
  twilio: Awaited<ReturnType<typeof twilioApiContext>>,
  isoCountry: string,
  numberKind: keyof typeof KINDS,
  phoneNumber: string,
) {
  const query = new URLSearchParams({
    VoiceEnabled: "true",
    PageSize: "20",
    Contains: phoneNumber,
  });
  const result = await twilioRequest<
    { available_phone_numbers?: AvailableNumber[] }
  >(
    twilio,
    twilioAccountUrl(
      twilio,
      `AvailablePhoneNumbers/${isoCountry}/${KINDS[numberKind]}.json?${query}`,
    ),
  );
  return (result.available_phone_numbers ?? []).find((number) =>
    number.phone_number === phoneNumber
  ) ?? null;
}

// The provider purchase and the local canonical insert cannot be atomic. This
// function is deliberately reusable so retrying the same intent repairs the
// local state without buying a second number.
// deno-lint-ignore no-explicit-any
async function persistPurchasedNumber(
  context: any,
  twilio: any,
  intent: any,
  purchased: PurchasedNumber,
) {
  const { data: currentDefault } = await context.admin.from(
    "organization_phone_numbers",
  ).select("id")
    .eq("organization_id", context.organizationId).eq("provider", "twilio")
    .eq("number_type", "company").eq("is_default_outbound", true)
    .eq("is_active", true).maybeSingle();
  const makeDefault = intent.number_type === "company" && !currentDefault;
  const { data: saved, error: saveError } = await context.admin.from(
    "organization_phone_numbers",
  ).upsert({
    organization_id: context.organizationId,
    organization_integration_id: twilio.integrationId,
    provider: "twilio",
    provider_number_id: purchased.sid,
    twilio_phone_sid: purchased.sid,
    phone_number: purchased.phone_number,
    friendly_name: intent.friendly_name || purchased.friendly_name ||
      purchased.phone_number,
    iso_country: purchased.iso_country || intent.iso_country,
    number_kind: intent.number_kind,
    capabilities: purchased.capabilities || intent.capabilities || {},
    number_type: intent.number_type,
    assigned_user_id: intent.number_type === "user"
      ? intent.assigned_user_id
      : null,
    missed_call_owner_user_id: intent.missed_call_owner_user_id,
    is_active: true,
    is_primary: makeDefault,
    is_default_outbound: makeDefault,
    recording_enabled: false,
    ring_strategy: intent.number_type === "user"
      ? "specific_users"
      : "round_robin",
    ring_timeout_seconds: 15,
    max_attempts: intent.number_type === "user" ? 1 : 3,
    address_sid: intent.address_sid,
    regulatory_bundle_sid: intent.regulatory_bundle_sid,
    sync_status: "synced",
    last_synced_at: new Date().toISOString(),
  }, { onConflict: "organization_id,phone_number" }).select("id").single();
  if (saveError || !saved) {
    throw new Error(saveError?.message || "canonical_number_save_failed");
  }
  const grantUsers = new Set<string>([intent.requested_by_user_id]);
  if (intent.assigned_user_id) grantUsers.add(intent.assigned_user_id);
  for (const userId of grantUsers) {
    const { error } = await context.admin.from(
      "organization_phone_number_users",
    ).upsert({
      organization_id: context.organizationId,
      phone_number_id: saved.id,
      user_id: userId,
      can_receive_calls: userId === intent.assigned_user_id ||
        intent.number_type === "company",
      can_originate_calls: true,
      priority: userId === intent.assigned_user_id ? 1 : 100,
    }, { onConflict: "phone_number_id,user_id" });
    if (error) throw new Error(`number_grant_failed:${error.message}`);
  }
  await context.admin.from("telephony_number_purchase_intents").update({
    status: "purchased",
    phone_number_id: saved.id,
    error_code: null,
    error_detail: null,
    updated_at: new Date().toISOString(),
  }).eq("id", intent.id);
  return saved.id as string;
}

Deno.serve(async (req) => {
  const preflight = corsPreflight(req);
  if (preflight) return preflight;
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    const context = await requireTelephonyUser(req);
    requireManager(context.permissions);
    if (!await telephonyV2Enabled(context.admin, context.organizationId)) {
      return json({ error: "telephony_v2_disabled" }, 404);
    }
    const body = await req.json() as CatalogBody;
    const twilio = await twilioApiContext(
      context.admin,
      context.organizationId,
    );

    if (body.action === "search") {
      const { isoCountry, numberKind } = normalizedInput(body);
      const query = new URLSearchParams({
        VoiceEnabled: "true",
        PageSize: "30",
      });
      if (body.contains?.trim()) query.set("Contains", body.contains.trim());
      const [available, quote, regulatory] = await Promise.all([
        twilioRequest<{ available_phone_numbers?: AvailableNumber[] }>(
          twilio,
          twilioAccountUrl(
            twilio,
            `AvailablePhoneNumbers/${isoCountry}/${
              KINDS[numberKind]
            }.json?${query}`,
          ),
        ),
        pricing(twilio, isoCountry, numberKind),
        regulations(twilio, isoCountry, numberKind),
      ]);
      return json({
        numbers: (available.available_phone_numbers ?? []).map((number) => ({
          phoneNumber: number.phone_number,
          friendlyName: number.friendly_name || number.phone_number,
          isoCountry: number.iso_country || isoCountry,
          capabilities: number.capabilities || {},
          addressRequirements: number.address_requirements || "none",
        })),
        quote,
        regulatory,
      });
    }

    if (body.action === "regulatory") {
      const { isoCountry, numberKind } = normalizedInput(body);
      const regulatoryKind = numberKind.replaceAll("_", "-");
      const [addresses, bundles, regulatory] = await Promise.all([
        twilioRequest<{ addresses?: Array<Record<string, unknown>> }>(
          twilio,
          `${twilioAccountUrl(twilio, "Addresses.json")}?IsoCountry=${
            encodeURIComponent(isoCountry)
          }&PageSize=1000`,
        ),
        twilioRequest<{ results?: Array<Record<string, unknown>> }>(
          twilio,
          `https://numbers.twilio.com/v2/RegulatoryCompliance/Bundles?Status=twilio-approved&IsoCountry=${
            encodeURIComponent(isoCountry)
          }&NumberType=${encodeURIComponent(regulatoryKind)}&PageSize=100`,
        ),
        regulations(twilio, isoCountry, numberKind),
      ]);
      return json({
        addresses: addresses.addresses ?? [],
        bundles: bundles.results ?? [],
        regulatory,
      });
    }

    if (body.action === "quote") {
      const { isoCountry, numberKind } = normalizedInput(body);
      const phoneNumber = String(body.phoneNumber || "").trim();
      const numberType = body.numberType === "user" ? "user" : "company";
      const missedOwner = body.missedCallOwnerUserId || context.userId;
      if (!/^\+[1-9]\d{6,14}$/.test(phoneNumber) || !body.idempotencyKey) {
        return json(
          { error: "phone_number_and_idempotency_key_required" },
          400,
        );
      }
      const memberIds = [
        missedOwner,
        ...(numberType === "user" && body.assignedUserId
          ? [body.assignedUserId]
          : []),
      ];
      const { data: memberships } = await context.admin.from(
        "user_organizations",
      ).select("user_id")
        .eq("organization_id", context.organizationId).eq("is_active", true).in(
          "user_id",
          memberIds,
        );
      if ((memberships ?? []).length !== new Set(memberIds).size) {
        return json({ error: "invalid_number_owner" }, 400);
      }
      if (numberType === "user" && !body.assignedUserId) {
        return json({ error: "assigned_user_required" }, 400);
      }
      if (numberType === "user") {
        await context.admin.from("telephony_number_purchase_intents").update({
          status: "expired",
          updated_at: new Date().toISOString(),
        }).eq("organization_id", context.organizationId).eq(
          "provider",
          "twilio",
        ).eq("number_type", "user").eq(
          "assigned_user_id",
          body.assignedUserId,
        ).eq("status", "awaiting_confirmation").lte(
          "expires_at",
          new Date().toISOString(),
        );
        const { data: existingPersonal } = await context.admin.from(
          "organization_phone_numbers",
        ).select("id")
          .eq("organization_id", context.organizationId).eq(
            "provider",
            "twilio",
          )
          .eq("number_type", "user").eq("assigned_user_id", body.assignedUserId)
          .eq("is_active", true).maybeSingle();
        if (existingPersonal) {
          return json(
            { error: "user_already_has_active_personal_number" },
            409,
          );
        }
      }
      const [available, currentPrice, regulatory] = await Promise.all([
        exactAvailable(twilio, isoCountry, numberKind, phoneNumber),
        pricing(twilio, isoCountry, numberKind),
        regulations(twilio, isoCountry, numberKind),
      ]);
      if (!available) {
        return json({ error: "phone_number_no_longer_available" }, 409);
      }
      if (currentPrice.monthlyPrice === null) {
        return json({ error: "recurring_price_unavailable" }, 502);
      }
      const requiresAddress = !["none", ""].includes(
        String(available.address_requirements || "none").toLowerCase(),
      );
      if (requiresAddress && !body.addressSid) {
        return json({ error: "approved_address_required" }, 400);
      }
      if (regulatory.requiresBundle && !body.bundleSid) {
        return json({ error: "approved_regulatory_bundle_required" }, 400);
      }
      try {
        if (body.addressSid) {
          const address = await twilioRequest<{
            sid?: string;
            iso_country?: string;
          }>(
            twilio,
            twilioAccountUrl(twilio, `Addresses/${body.addressSid}.json`),
          );
          if (
            address.sid !== body.addressSid ||
            String(address.iso_country || "").toUpperCase() !== isoCountry
          ) return json({ error: "approved_address_invalid_for_country" }, 400);
        }
        if (body.bundleSid) {
          const expectedKind = numberKind.replaceAll("_", "-");
          const approved = await twilioRequest<{
            results?: Array<{ sid?: string }>;
          }>(
            twilio,
            `https://numbers.twilio.com/v2/RegulatoryCompliance/Bundles?Status=twilio-approved&IsoCountry=${
              encodeURIComponent(isoCountry)
            }&NumberType=${encodeURIComponent(expectedKind)}&PageSize=100`,
          );
          if (
            !(approved.results ?? []).some((bundle) =>
              bundle.sid === body.bundleSid
            )
          ) return json({ error: "approved_bundle_invalid_for_number" }, 400);
        }
      } catch (error) {
        console.warn(
          "[telephony-number-catalog] regulatory selection invalid",
          error,
        );
        return json({ error: "approved_regulatory_resource_not_found" }, 400);
      }
      const expiresAt = new Date(Date.now() + 10 * 60_000).toISOString();
      const { data: purchaseIntent, error } = await context.admin.from(
        "telephony_number_purchase_intents",
      ).upsert({
        organization_id: context.organizationId,
        organization_integration_id: twilio.integrationId,
        requested_by_user_id: context.userId,
        idempotency_key: body.idempotencyKey,
        phone_number: phoneNumber,
        iso_country: isoCountry,
        number_kind: numberKind,
        number_type: numberType,
        assigned_user_id: numberType === "user" ? body.assignedUserId : null,
        missed_call_owner_user_id: missedOwner,
        friendly_name: body.friendlyName?.trim() || available.friendly_name ||
          phoneNumber,
        monthly_price: currentPrice.monthlyPrice,
        currency: currentPrice.currency,
        capabilities: available.capabilities || {},
        address_requirements: available.address_requirements || "none",
        regulatory_requirements: regulatory,
        address_sid: body.addressSid || null,
        regulatory_bundle_sid: body.bundleSid || null,
        status: "awaiting_confirmation",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      }, { onConflict: "organization_id,idempotency_key" }).select(
        "id, phone_number, monthly_price, currency, expires_at",
      ).single();
      if (error || !purchaseIntent) {
        if (error?.code === "23505" && numberType === "user") {
          return json(
            { error: "user_has_another_number_purchase_pending" },
            409,
          );
        }
        throw new Error(`purchase_quote_failed:${error?.message || "unknown"}`);
      }
      return json({
        purchaseIntentId: purchaseIntent.id,
        phoneNumber,
        ...currentPrice,
        expiresAt,
      }, 201);
    }

    if (body.action === "purchase") {
      if (!body.purchaseIntentId) {
        return json({ error: "purchase_intent_required" }, 400);
      }
      const { data: intent } = await context.admin.from(
        "telephony_number_purchase_intents",
      ).select("*")
        .eq("id", body.purchaseIntentId).eq(
          "organization_id",
          context.organizationId,
        ).maybeSingle();
      if (!intent) return json({ error: "purchase_intent_not_found" }, 404);
      if (intent.status === "purchased") {
        return json({
          success: true,
          phoneNumberId: intent.phone_number_id,
          providerNumberId: intent.provider_number_id,
        });
      }
      if (intent.status === "purchasing") {
        const lookup = await twilioRequest<{
          incoming_phone_numbers?: PurchasedNumber[];
        }>(
          twilio,
          `${
            twilioAccountUrl(twilio, "IncomingPhoneNumbers.json")
          }?PhoneNumber=${encodeURIComponent(intent.phone_number)}&PageSize=20`,
        ).catch(() => null);
        const providerPurchased = lookup?.incoming_phone_numbers?.find(
          (number) => number.phone_number === intent.phone_number,
        );
        if (providerPurchased) {
          await context.admin.from("telephony_number_purchase_intents").update({
            provider_number_id: providerPurchased.sid,
            purchased_at: intent.purchased_at || new Date().toISOString(),
            status: "provider_purchased_recovery_required",
            updated_at: new Date().toISOString(),
          }).eq("id", intent.id);
          try {
            const phoneNumberId = await persistPurchasedNumber(
              context,
              twilio,
              intent,
              providerPurchased,
            );
            return json({
              success: true,
              recovered: true,
              phoneNumberId,
              providerNumberId: providerPurchased.sid,
            });
          } catch (error) {
            return json({
              error: "number_purchased_recovery_required",
              detail: error instanceof Error ? error.message : String(error),
              providerNumberId: providerPurchased.sid,
            }, 500);
          }
        }
        if (!lookup) {
          return json({ error: "purchase_reconciliation_unavailable" }, 503);
        }
        const stale = new Date(intent.updated_at).getTime() <=
          Date.now() - 2 * 60_000;
        if (!stale) return json({ error: "purchase_already_in_progress" }, 409);
        await context.admin.from("telephony_number_purchase_intents").update({
          status: "awaiting_confirmation",
          error_code: "stale_purchase_retried",
          updated_at: new Date().toISOString(),
        }).eq("id", intent.id).eq("status", "purchasing");
        intent.status = "awaiting_confirmation";
      }
      if (
        intent.status === "provider_purchased_recovery_required" &&
        intent.provider_number_id
      ) {
        try {
          const purchased = await twilioRequest<PurchasedNumber>(
            twilio,
            twilioAccountUrl(
              twilio,
              `IncomingPhoneNumbers/${intent.provider_number_id}.json`,
            ),
          );
          const phoneNumberId = await persistPurchasedNumber(
            context,
            twilio,
            intent,
            purchased,
          );
          return json({
            success: true,
            recovered: true,
            phoneNumberId,
            providerNumberId: purchased.sid,
          });
        } catch (error) {
          await context.admin.from("telephony_number_purchase_intents").update({
            error_code: "canonical_number_recovery_failed",
            error_detail: error instanceof Error
              ? error.message
              : String(error),
            updated_at: new Date().toISOString(),
          }).eq("id", intent.id);
          return json({
            error: "number_purchased_recovery_required",
            providerNumberId: intent.provider_number_id,
          }, 500);
        }
      }
      if (
        intent.status !== "awaiting_confirmation" ||
        new Date(intent.expires_at).getTime() <= Date.now()
      ) {
        if (new Date(intent.expires_at).getTime() <= Date.now()) {
          await context.admin.from("telephony_number_purchase_intents").update({
            status: "expired",
          }).eq("id", intent.id);
        }
        return json({ error: "purchase_intent_expired_or_processed" }, 409);
      }
      if (
        body.confirmPhoneNumber !== intent.phone_number ||
        !pricesEqual(body.confirmMonthlyPrice, intent.monthly_price)
      ) {
        return json({ error: "purchase_confirmation_mismatch" }, 409);
      }
      if (intent.number_type === "user") {
        const { data: existingPersonal } = await context.admin.from(
          "organization_phone_numbers",
        ).select("id")
          .eq("organization_id", context.organizationId).eq(
            "provider",
            "twilio",
          )
          .eq("number_type", "user").eq(
            "assigned_user_id",
            intent.assigned_user_id,
          )
          .eq("is_active", true).maybeSingle();
        if (existingPersonal) {
          return json(
            { error: "user_already_has_active_personal_number" },
            409,
          );
        }
      }
      const refreshedPrice = await pricing(
        twilio,
        intent.iso_country,
        intent.number_kind,
      );
      if (!pricesEqual(refreshedPrice.monthlyPrice, intent.monthly_price)) {
        await context.admin.from("telephony_number_purchase_intents").update({
          monthly_price: refreshedPrice.monthlyPrice,
          currency: refreshedPrice.currency,
          expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
          updated_at: new Date().toISOString(),
        }).eq("id", intent.id);
        return json({ error: "price_changed", quote: refreshedPrice }, 409);
      }
      const claimed = await context.admin.from(
        "telephony_number_purchase_intents",
      ).update({ status: "purchasing", updated_at: new Date().toISOString() })
        .eq("id", intent.id).eq("status", "awaiting_confirmation").select("id")
        .maybeSingle();
      if (!claimed.data) {
        return json({ error: "purchase_already_in_progress" }, 409);
      }
      let purchased: PurchasedNumber;
      try {
        purchased = await twilioRequest(
          twilio,
          twilioAccountUrl(twilio, "IncomingPhoneNumbers.json"),
          {
            method: "POST",
            form: {
              PhoneNumber: intent.phone_number,
              FriendlyName: intent.friendly_name || intent.phone_number,
              VoiceApplicationSid: twilio.twimlAppSid,
              AddressSid: intent.address_sid,
              BundleSid: intent.regulatory_bundle_sid,
            },
          },
        );
      } catch (error) {
        // A timeout can happen after Twilio accepted the purchase. Reconcile by
        // exact number before declaring failure so a retry never buys twice.
        const lookup = await twilioRequest<{
          incoming_phone_numbers?: PurchasedNumber[];
        }>(
          twilio,
          `${
            twilioAccountUrl(twilio, "IncomingPhoneNumbers.json")
          }?PhoneNumber=${encodeURIComponent(intent.phone_number)}&PageSize=20`,
        ).catch(() => null);
        const providerPurchased = lookup?.incoming_phone_numbers?.find(
          (number) => number.phone_number === intent.phone_number,
        );
        if (providerPurchased) {
          purchased = providerPurchased;
        } else {
          const safe = safeTwilioError(error);
          await context.admin.from("telephony_number_purchase_intents").update({
            status: "failed",
            error_code: safe.code,
            error_detail: safe.detail,
            updated_at: new Date().toISOString(),
          }).eq("id", intent.id);
          throw error;
        }
      }
      await context.admin.from("telephony_number_purchase_intents").update({
        provider_number_id: purchased.sid,
        purchased_at: new Date().toISOString(),
        status: "provider_purchased_recovery_required",
        updated_at: new Date().toISOString(),
      }).eq("id", intent.id);
      try {
        const phoneNumberId = await persistPurchasedNumber(
          context,
          twilio,
          intent,
          purchased,
        );
        return json({
          success: true,
          phoneNumberId,
          providerNumberId: purchased.sid,
        }, 201);
      } catch (error) {
        await context.admin.from("telephony_number_purchase_intents").update({
          status: "provider_purchased_recovery_required",
          error_code: "canonical_number_save_failed",
          error_detail: error instanceof Error ? error.message : String(error),
          updated_at: new Date().toISOString(),
        }).eq("id", intent.id);
        return json({
          error: "number_purchased_recovery_required",
          providerNumberId: purchased.sid,
        }, 500);
      }
    }

    return json({ error: "invalid_action" }, 400);
  } catch (error) {
    if (error instanceof Response) return error;
    console.error("[telephony-number-catalog]", error);
    const safe = safeTwilioError(error);
    return json({ error: safe.code, detail: safe.detail }, 500);
  }
});
