import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";
import { decryptSecret, encryptSecret } from "../_shared/crypto.ts";
import { metaGraphGet } from "../_shared/meta-graph.ts";

// Auto-mapping: known Meta field keys → contact standard fields
const AUTO_MAP: Record<string, string> = {
  email: "email",
  phone_number: "phone",
  full_name: "full_name",
  first_name: "first_name",
  last_name: "last_name",
  company_name: "company_name",
  city: "address_city",
  state: "address_state",
  street_address: "address_street",
  zip_code: "address_zip",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: authErr } = await userClient.auth.getClaims(token);
    if (authErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);

    const { organization_integration_id, organization_id } = await req.json();
    if (!organization_integration_id || !organization_id) {
      return json({ error: "Missing required fields" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const { data: orgIntegration } = await admin
      .from("organization_integrations")
      .select("id, organization_id, connected_account")
      .eq("id", organization_integration_id)
      .maybeSingle();
    if (!orgIntegration || orgIntegration.organization_id !== organization_id) {
      return json({ error: "Integration not found" }, 404);
    }

    const ca: any = orgIntegration.connected_account || {};
    const accessToken = await decryptSecret(ca.system_user_token_encrypted);
    const appSecret = await decryptSecret(ca.app_secret_encrypted);

    // 1) List pages
    const pagesResp = await metaGraphGet("/me/accounts", {
      fields: "id,name,access_token,category",
      limit: 100,
    }, { accessToken, appSecret });

    const pages: any[] = pagesResp.data || [];
    const pageIds: string[] = [];

    for (const page of pages) {
      const pageTokenEnc = await encryptSecret(page.access_token);
      const { data: upserted } = await admin
        .from("meta_lead_pages")
        .upsert(
          {
            organization_id,
            organization_integration_id,
            meta_page_id: page.id,
            meta_page_name: page.name,
            meta_business_id: ca.business_id || null,
            meta_page_category: page.category || null,
            page_access_token_encrypted: pageTokenEnc,
            is_active: true,
            discovered_at: new Date().toISOString(),
          },
          { onConflict: "organization_integration_id,meta_page_id" },
        )
        .select("id")
        .single();
      if (upserted) pageIds.push(upserted.id);

      // 2) List forms for this page
      try {
        const formsResp = await metaGraphGet(`/${page.id}/leadgen_forms`, {
          fields: "id,name,status,created_time",
          limit: 100,
        }, { accessToken: page.access_token, appSecret });
        const forms: any[] = formsResp.data || [];
        const { data: pageRow } = await admin
          .from("meta_lead_pages")
          .select("id")
          .eq("organization_integration_id", organization_integration_id)
          .eq("meta_page_id", page.id)
          .maybeSingle();
        if (!pageRow) continue;

        for (const form of forms) {
          const { data: formUp } = await admin
            .from("lead_forms")
            .upsert(
              {
                organization_id,
                provider: "meta_lead_ads",
                provider_form_id: form.id,
                provider_form_name: form.name,
                provider_metadata: { status: form.status, created_time: form.created_time },
                meta_lead_page_id: pageRow.id,
                organization_integration_id,
                discovered_at: new Date().toISOString(),
              },
              { onConflict: "organization_integration_id,provider_form_id" },
            )
            .select("id, questions_synced_at")
            .single();
          if (!formUp) continue;

          // 3) Fetch questions only if not synced yet
          if (!formUp.questions_synced_at) {
            try {
              const qResp = await metaGraphGet(`/${form.id}`, { fields: "questions" }, {
                accessToken: page.access_token,
                appSecret,
              });
              const questions: any[] = qResp.questions || [];
              for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                const fieldKey = q.key || q.name || q.id || `q_${i}`;
                const auto = AUTO_MAP[fieldKey];
                await admin.from("lead_form_questions").upsert(
                  {
                    organization_id,
                    lead_form_id: formUp.id,
                    field_key: fieldKey,
                    field_label: q.label || fieldKey,
                    field_type: q.type || "text",
                    field_options: q.options || null,
                    field_order: i,
                    mapping_strategy: auto ? "standard_field" : "note",
                    mapped_to_contact_field: auto || null,
                    is_configured: !!auto,
                  },
                  { onConflict: "lead_form_id,field_key" },
                );
              }
              await admin
                .from("lead_forms")
                .update({ questions_synced_at: new Date().toISOString() })
                .eq("id", formUp.id);
            } catch (qe: any) {
              console.warn("Failed to fetch questions for form", form.id, qe.message);
            }
          }
        }
      } catch (fe: any) {
        console.warn("Failed to list forms for page", page.id, fe.message);
      }
    }

    return json({ success: true, pages_discovered: pages.length });
  } catch (e: any) {
    console.error("meta-lead-ads-discover error", e);
    return json({ error: e.message || "Internal error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
