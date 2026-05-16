import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyOrgUsers } from "../_shared/notify.ts";
import { validateServiceRoleAuth } from "../_shared/auth.ts";

function normalizePhoneToE164(phone: string): string {
  if (!phone) return "";
  let cleaned = phone.replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned;
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    const ddd = parseInt(cleaned.substring(0, 2));
    if (ddd >= 11 && ddd <= 99) return `+55${cleaned}`;
  }
  return `+55${cleaned}`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const auth = validateServiceRoleAuth(req);
  if (!auth.ok) {
    console.warn("Auth failed:", auth.error);
    return json({ error: "Unauthorized", details: auth.error }, 401);
  }

  try {
    const { lead, organization_id, lead_form_id, lead_form_name, settings } =
      await req.json();
    if (!lead?.id || !organization_id) return json({ error: "Invalid payload" }, 400);

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Idempotency
    const { data: existing } = await admin
      .from("contacts")
      .select("id")
      .eq("organization_id", organization_id)
      .eq("source", "meta_lead_ads")
      .eq("source_external_id", lead.id)
      .maybeSingle();
    if (existing) {
      return json({ success: true, skipped: true, contact_id: existing.id });
    }

    // Map field_data into a Map<key,value>
    const fieldMap = new Map<string, string>();
    for (const fd of lead.field_data || []) {
      const v = Array.isArray(fd.values) ? fd.values.join(", ") : String(fd.values ?? "");
      fieldMap.set(fd.name, v);
    }

    // Load questions
    const { data: questions } = await admin
      .from("lead_form_questions")
      .select("*")
      .eq("lead_form_id", lead_form_id);

    // === Buckets per entity ===
    const contactStandard: Record<string, any> = {};
    const oppStandard: Record<string, any> = {};
    const contactCustomFields: Array<{ definition_id: string; value: string }> = [];
    const oppCustomFields: Array<{ definition_id: string; value: string }> = [];
    const contactTags: Array<{ name?: string; tag_id?: string; color?: string }> = [];
    const oppTags: Array<{ name?: string; tag_id?: string; color?: string }> = [];
    const noteLines: string[] = [];
    const unmappedFields: string[] = [];
    const handled = new Set<string>();

    for (const q of questions || []) {
      const value = fieldMap.get(q.field_key);
      handled.add(q.field_key);
      if (value === undefined || value === "") continue;

      const isOpp = (q.target_entity || "contact") === "opportunity";

      switch (q.mapping_strategy) {
        case "standard_field":
          if (q.mapped_to_contact_field) {
            if (isOpp) oppStandard[q.mapped_to_contact_field] = value;
            else contactStandard[q.mapped_to_contact_field] = value;
          }
          break;
        case "custom_field":
          if (q.custom_field_definition_id) {
            const bucket = isOpp ? oppCustomFields : contactCustomFields;
            bucket.push({ definition_id: q.custom_field_definition_id, value });
          }
          break;
        case "tag": {
          const strat = q.tag_strategy || "value_as_tag";
          const bucket = isOpp ? oppTags : contactTags;
          if (strat === "fixed_tag" && q.fixed_tag_id) {
            bucket.push({ tag_id: q.fixed_tag_id });
          } else if (strat === "option_as_tag") {
            const opts = String(value).split(",").map((s) => s.trim()).filter(Boolean);
            for (const opt of opts) {
              bucket.push({
                name: q.tag_prefix ? `${q.tag_prefix}${opt}` : opt,
                color: q.tag_color,
              });
            }
          } else if (strat === "value_with_prefix") {
            bucket.push({ name: `${q.tag_prefix || ""}${value}`, color: q.tag_color });
          } else {
            bucket.push({ name: value, color: q.tag_color });
          }
          noteLines.push(`${q.field_label}: ${value}`);
          break;
        }
        case "ignore":
          break;
        case "note":
        default:
          noteLines.push(`${q.field_label}: ${value}`);
      }
    }

    // Detect unmapped (new) fields
    for (const [k, v] of fieldMap.entries()) {
      if (!handled.has(k)) {
        unmappedFields.push(k);
        noteLines.push(`[⚠ pergunta nova] ${k}: ${v}`);
      }
    }

    // Normalize (contact only)
    const fullName =
      contactStandard.full_name ||
      [contactStandard.first_name, contactStandard.last_name].filter(Boolean).join(" ").trim() ||
      "Lead Meta";
    const firstName = contactStandard.first_name || fullName.split(" ")[0];
    const lastName =
      contactStandard.last_name ||
      (fullName.split(" ").length > 1 ? fullName.split(" ").slice(1).join(" ") : null);
    const email = contactStandard.email ? String(contactStandard.email).trim().toLowerCase() : null;
    const phone = contactStandard.phone ? normalizePhoneToE164(String(contactStandard.phone)) : null;

    // Dedup by org settings
    const { data: org } = await admin
      .from("organizations")
      .select("duplicate_check_mode")
      .eq("id", organization_id)
      .maybeSingle();
    const dupMode = org?.duplicate_check_mode || "none";

    let existingId: string | null = null;
    if (dupMode === "phone" && phone) {
      const { data } = await admin
        .from("contacts")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("phone", phone)
        .is("deleted_at", null)
        .maybeSingle();
      existingId = data?.id || null;
    } else if (dupMode === "email" && email) {
      const { data } = await admin
        .from("contacts")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("email", email)
        .is("deleted_at", null)
        .maybeSingle();
      existingId = data?.id || null;
    } else if (dupMode === "email_or_phone") {
      if (phone) {
        const { data } = await admin
          .from("contacts").select("id")
          .eq("organization_id", organization_id).eq("phone", phone)
          .is("deleted_at", null).maybeSingle();
        existingId = data?.id || null;
      }
      if (!existingId && email) {
        const { data } = await admin
          .from("contacts").select("id")
          .eq("organization_id", organization_id).eq("email", email)
          .is("deleted_at", null).maybeSingle();
        existingId = data?.id || null;
      }
    }

    // Safety net: DB has UNIQUE (organization_id, phone_normalized).
    // Even if dupMode doesn't include phone, we must look it up to avoid 23505.
    if (!existingId && phone) {
      const { data: byPhone } = await admin
        .from("contacts")
        .select("id")
        .eq("organization_id", organization_id)
        .eq("phone", phone)
        .is("deleted_at", null)
        .maybeSingle();
      if (byPhone?.id) existingId = byPhone.id;
    }

    // Owner: settings.default_owner_user_id → round_robin → null
    let ownerId: string | null = settings?.default_owner_user_id ?? null;
    if (!ownerId && settings?.use_round_robin !== false) {
      const { data: rrId } = await admin.rpc("assign_round_robin", {
        _org_id: organization_id,
      });
      ownerId = (rrId as string) || null;
    }

    let contactId: string;
    if (existingId) {
      contactId = existingId;
      await admin
        .from("contacts")
        .update({
          source: "meta_lead_ads",
          source_external_id: lead.id,
          ...(phone ? { phone } : {}),
          ...(email ? { email } : {}),
        })
        .eq("id", contactId);
    } else {
      const { data: ins, error: insErr } = await admin
        .from("contacts")
        .insert({
          organization_id,
          full_name: fullName,
          first_name: firstName,
          last_name: lastName,
          email,
          phone,
          source: "meta_lead_ads",
          source_external_id: lead.id,
          lifecycle_stage: settings?.default_lifecycle_stage || "lead",
          owner_user_id: ownerId,
          utm_source: "facebook",
          utm_medium: "paid_social",
          utm_campaign: lead.campaign_name || null,
          ad_referral_source_id: lead.ad_id || null,
          ad_referral_source_type: "lead_form",
          ad_referral_captured_at: lead.created_time || new Date().toISOString(),
          created_at: lead.created_time || new Date().toISOString(),
        })
        .select("id")
        .maybeSingle();
      if (insErr) {
        // Race condition or stale dedup state: another path inserted this contact.
        if ((insErr as any).code === "23505" && phone) {
          console.warn("[meta-lead-ads] 23505 on insert, recovering by phone lookup", phone);
          const { data: recovered } = await admin
            .from("contacts")
            .select("id")
            .eq("organization_id", organization_id)
            .eq("phone", phone)
            .is("deleted_at", null)
            .maybeSingle();
          if (!recovered?.id) throw insErr;
          contactId = recovered.id;
          existingId = recovered.id; // mark as existing → skip auto-WA template
        } else {
          throw insErr;
        }
      } else {
        contactId = ins!.id;
      }
    }

    // Contact custom field values
    for (const op of contactCustomFields) {
      await admin.from("custom_field_values").upsert(
        {
          organization_id,
          module: "contacts",
          record_id: contactId,
          field_definition_id: op.definition_id,
          value: { text: op.value },
        },
        { onConflict: "record_id,field_definition_id" },
      );
    }

    // Contact tags
    for (const op of contactTags) {
      let tagId = op.tag_id;
      if (!tagId && op.name) {
        const { data: existingTag } = await admin
          .from("tags")
          .select("id")
          .eq("organization_id", organization_id)
          .eq("name", op.name)
          .maybeSingle();
        if (existingTag) tagId = existingTag.id;
        else {
          const { data: newTag } = await admin
            .from("tags")
            .insert({
              organization_id,
              name: op.name,
              color: op.color || "#3b82f6",
            })
            .select("id")
            .single();
          tagId = newTag?.id;
        }
      }
      if (tagId) {
        await admin.from("tag_assignments").upsert(
          {
            organization_id,
            tag_id: tagId,
            entity_type: "contact",
            entity_id: contactId,
          },
          { onConflict: "tag_id,entity_type,entity_id" },
        );
      }
    }

    // === Opportunity (conditional) ===
    const hasOppMappings =
      Object.keys(oppStandard).length > 0 ||
      oppCustomFields.length > 0 ||
      oppTags.length > 0;

    const shouldCreateOpp = hasOppMappings || settings?.auto_create_opportunity === true;

    let opportunityId: string | null = null;

    if (shouldCreateOpp) {
      if (!settings?.default_pipeline_stage_id) {
        console.warn(
          "Cannot create opportunity: default_pipeline_stage_id not configured",
        );
      } else {
        const oppTitle =
          oppStandard.title || `${fullName} — ${lead_form_name || "Meta Lead"}`;

        const { data: opp, error: oppErr } = await admin
          .from("opportunities")
          .insert({
            organization_id,
            contact_id: contactId,
            pipeline_stage_id: settings.default_pipeline_stage_id,
            title: oppTitle,
            amount: oppStandard.amount ? Number(oppStandard.amount) : 0,
            close_date: oppStandard.close_date || null,
            status: "open",
            owner_user_id: ownerId,
            source: "meta_lead_ads",
            source_external_id: lead.id,
            created_at: lead.created_time || new Date().toISOString(),
          })
          .select("id")
          .single();

        if (oppErr) {
          console.error("Failed to create opportunity:", oppErr);
        } else {
          opportunityId = opp.id;

          // Opportunity custom fields
          for (const op of oppCustomFields) {
            await admin.from("custom_field_values").upsert(
              {
                organization_id,
                module: "opportunities",
                record_id: opportunityId,
                field_definition_id: op.definition_id,
                value: { text: op.value },
              },
              { onConflict: "record_id,field_definition_id" },
            );
          }

          // Opportunity tags
          for (const op of oppTags) {
            let tagId = op.tag_id;
            if (!tagId && op.name) {
              const { data: existingTag } = await admin
                .from("tags")
                .select("id")
                .eq("organization_id", organization_id)
                .eq("name", op.name)
                .maybeSingle();
              if (existingTag) tagId = existingTag.id;
              else {
                const { data: newTag } = await admin
                  .from("tags")
                  .insert({
                    organization_id,
                    name: op.name,
                    color: op.color || "#3b82f6",
                  })
                  .select("id")
                  .single();
                tagId = newTag?.id;
              }
            }
            if (tagId) {
              await admin.from("tag_assignments").upsert(
                {
                  organization_id,
                  tag_id: tagId,
                  entity_type: "opportunity",
                  entity_id: opportunityId,
                },
                { onConflict: "tag_id,entity_type,entity_id" },
              );
            }
          }
        }
      }
    }

    // Activity log (single row on contact, linked to opp when applicable)
    await admin.from("activities").insert({
      organization_id,
      contact_id: contactId,
      opportunity_id: opportunityId,
      activity_type: "system",
      title: `Lead recebido via Meta — ${lead_form_name || "Formulário"}`,
      body:
        `=== Atribuição ===\n` +
        (lead.campaign_name ? `Campanha: ${lead.campaign_name}\n` : "") +
        (lead.adset_name ? `Conjunto: ${lead.adset_name}\n` : "") +
        (lead.ad_name ? `Anúncio: ${lead.ad_name}\n` : "") +
        (lead.platform
          ? `Plataforma: ${lead.platform === "fb" ? "Facebook" : "Instagram"}\n`
          : "") +
        `\n=== Respostas ===\n${noteLines.join("\n") || "(sem respostas)"}` +
        (unmappedFields.length
          ? `\n\nCampos não mapeados: ${unmappedFields.join(", ")}`
          : ""),
      occurred_at: lead.created_time || new Date().toISOString(),
      source_external_id: lead.id,
    });

    // Mark form mapping incomplete if new fields appeared
    if (unmappedFields.length > 0) {
      await admin
        .from("lead_forms")
        .update({ is_mapping_configured: false })
        .eq("id", lead_form_id);
      await notifyOrgUsers(admin, organization_id, {
        type: "info",
        title: "Novas perguntas em formulário Meta",
        body: `O formulário "${lead_form_name}" possui novas perguntas que precisam ser mapeadas.`,
        entity_type: "lead_form",
        entity_id: lead_form_id,
      });
    }

    // Auto-send WhatsApp template (only on first contact creation, when phone is present)
    console.log("[auto-wa] eval", {
      isNew: !existingId,
      hasPhone: !!phone,
      autoSend: settings?.auto_send_whatsapp,
      tplId: settings?.whatsapp_template_id ?? null,
    });
    if (
      !existingId &&
      phone &&
      settings?.auto_send_whatsapp === true &&
      settings?.whatsapp_template_id
    ) {
      try {
        const tokens: Record<string, string> = {
          first_name: firstName || "",
          full_name: fullName || "",
          form_name: lead_form_name || "",
          campaign_name: lead.campaign_name || "",
          ad_name: lead.ad_name || "",
        };
        const replaceTokens = (str: string) =>
          str.replace(/\{(\w+)\}/g, (_m, key) =>
            tokens[key] !== undefined ? tokens[key] : `{${key}}`,
          );
        const rawVars = (settings.whatsapp_template_variables || {}) as Record<string, string>;
        const templateVariables: Record<string, string> = {};
        for (const [k, v] of Object.entries(rawVars)) {
          templateVariables[k] = replaceTokens(String(v ?? ""));
        }

        const sendUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/twilio-whatsapp-send`;
        const sendRes = await fetch(sendUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          },
          body: JSON.stringify({
            organizationId: organization_id,
            contactId,
            templateId: settings.whatsapp_template_id,
            templateVariables,
            isAgentMessage: false,
            senderName: "Meta Lead Ads (auto)",
          }),
        });
        if (!sendRes.ok) {
          const errBody = await sendRes.text();
          console.warn("auto WhatsApp send failed", sendRes.status, errBody);
        }
      } catch (waErr) {
        console.warn("auto WhatsApp send error", waErr);
      }
    }

    // Name confirmation memory
    if (settings?.set_name_confirmed && fullName !== "Lead Meta") {
      await admin.from("contact_memories").upsert(
        {
          organization_id,
          contact_id: contactId,
          name_confirmed: true,
          name_confirmed_at: new Date().toISOString(),
          name_asked: true,
        },
        { onConflict: "contact_id" },
      );
    }

    return json({
      success: true,
      contact_id: contactId,
      opportunity_id: opportunityId,
      unmapped_fields: unmappedFields,
    });
  } catch (e: any) {
    console.error("meta-lead-ads-process-lead error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
