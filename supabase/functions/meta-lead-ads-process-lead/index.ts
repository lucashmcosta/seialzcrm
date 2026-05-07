import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { notifyOrgUsers } from "../_shared/notify.ts";

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

  // Manual auth: require service role key
  const authHeader = req.headers.get("authorization");
  const expected = `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`;
  if (authHeader !== expected) {
    return json({ error: "Unauthorized" }, 401);
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

    const standardUpdates: Record<string, any> = {};
    const customFieldOps: Array<{ definition_id: string; value: string }> = [];
    const tagOps: Array<{ name?: string; tag_id?: string; color?: string }> = [];
    const noteLines: string[] = [];
    const unmappedFields: string[] = [];
    const handled = new Set<string>();

    for (const q of questions || []) {
      const value = fieldMap.get(q.field_key);
      handled.add(q.field_key);
      if (value === undefined || value === "") continue;

      switch (q.mapping_strategy) {
        case "standard_field":
          if (q.mapped_to_contact_field) {
            standardUpdates[q.mapped_to_contact_field] = value;
          }
          break;
        case "custom_field":
          if (q.custom_field_definition_id) {
            customFieldOps.push({ definition_id: q.custom_field_definition_id, value });
          }
          break;
        case "tag": {
          const strat = q.tag_strategy || "value_as_tag";
          if (strat === "fixed_tag" && q.fixed_tag_id) {
            tagOps.push({ tag_id: q.fixed_tag_id });
          } else if (strat === "value_with_prefix") {
            tagOps.push({ name: `${q.tag_prefix || ""}${value}`, color: q.tag_color });
          } else {
            tagOps.push({ name: value, color: q.tag_color });
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

    // Normalize
    const fullName =
      standardUpdates.full_name ||
      [standardUpdates.first_name, standardUpdates.last_name].filter(Boolean).join(" ").trim() ||
      "Lead Meta";
    const firstName = standardUpdates.first_name || fullName.split(" ")[0];
    const lastName =
      standardUpdates.last_name ||
      (fullName.split(" ").length > 1 ? fullName.split(" ").slice(1).join(" ") : null);
    const email = standardUpdates.email ? String(standardUpdates.email).trim().toLowerCase() : null;
    const phone = standardUpdates.phone ? normalizePhoneToE164(String(standardUpdates.phone)) : null;

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
          ad_referral_source_id: lead.ad_id || null,
          ad_referral_source_type: "meta_lead_ads",
          ad_referral_captured_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insErr) throw insErr;
      contactId = ins.id;
    }

    // Custom field values
    for (const op of customFieldOps) {
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

    // Tags
    for (const op of tagOps) {
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

    // Activity log
    await admin.from("activities").insert({
      organization_id,
      contact_id: contactId,
      activity_type: "system",
      title: `Lead recebido via Meta — ${lead_form_name || "Formulário"}`,
      body:
        `Atribuição: ${ownerId ? "automática" : "sem dono"}\n\n` +
        `Respostas:\n${noteLines.join("\n") || "(sem respostas)"}` +
        (unmappedFields.length
          ? `\n\nCampos não mapeados: ${unmappedFields.join(", ")}`
          : ""),
      occurred_at: new Date().toISOString(),
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

    // Name confirmation memory
    if (settings?.set_name_confirmed && fullName !== "Lead Meta") {
      await admin.from("contact_memories").upsert(
        {
          organization_id,
          contact_id: contactId,
          facts: {},
          name_confirmed: true,
          name_confirmed_at: new Date().toISOString(),
          name_asked: true,
        },
        { onConflict: "contact_id" },
      ).select().maybeSingle();
    }

    // Auto opportunity
    let opportunityId: string | null = null;
    if (settings?.auto_create_opportunity && settings?.default_pipeline_stage_id) {
      const { data: opp } = await admin
        .from("opportunities")
        .insert({
          organization_id,
          contact_id: contactId,
          pipeline_stage_id: settings.default_pipeline_stage_id,
          title: `Lead Meta: ${fullName}`,
          status: "open",
          source: "meta_lead_ads",
          source_external_id: lead.id,
          owner_user_id: ownerId,
        })
        .select("id")
        .maybeSingle();
      opportunityId = opp?.id || null;
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
