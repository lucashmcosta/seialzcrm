import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-webhook-signature",
};

async function verifyHmac(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(body));
  const computed = Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
  return computed === signature;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const rawBody = await req.text();
  let payload: any;

  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Only handle document.completed
  if (payload.event !== "document.completed") {
    return new Response(JSON.stringify({ ok: true, skipped: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const metadata = payload.data?.metadata || {};
  const { deal_id, contact_id, connector_id } = metadata;

  // --- HMAC validation (optional, per-org) ---
  if (connector_id) {
    // Find org integration by connector_id in config_values
    const { data: orgIntegrations } = await supabase
      .from("organization_integrations")
      .select("config_values")
      .eq("is_enabled", true)
      .filter("config_values->>connector_id", "eq", connector_id);

    const orgConfig = orgIntegrations?.[0]?.config_values as any;
    const webhookSecret = orgConfig?.webhook_secret;

    if (webhookSecret) {
      const signature = req.headers.get("x-webhook-signature") || "";
      const valid = await verifyHmac(rawBody, signature, webhookSecret);
      if (!valid) {
        console.error("HMAC validation failed for connector_id:", connector_id);
        return new Response(
          JSON.stringify({ error: "Invalid signature" }),
          {
            status: 401,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    }
  }

  // --- Find opportunity ---
  if (!deal_id) {
    console.error("No deal_id in metadata");
    return new Response(
      JSON.stringify({ error: "deal_id is required in metadata" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const { data: opportunity, error: oppError } = await supabase
    .from("opportunities")
    .select("id, organization_id, title")
    .eq("id", deal_id)
    .maybeSingle();

  if (oppError || !opportunity) {
    console.error("Opportunity not found:", deal_id, oppError);
    return new Response(
      JSON.stringify({ error: "Opportunity not found" }),
      {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  const orgId = opportunity.organization_id;
  const document = payload.data?.document || {};
  const signatories = payload.data?.signatories || [];

  // --- Download signed PDF ---
  const fileUrl = document.file_url;
  if (!fileUrl) {
    console.error("No file_url in document data");
    return new Response(
      JSON.stringify({ error: "file_url is required" }),
      {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  let pdfBuffer: ArrayBuffer;
  try {
    const pdfResponse = await fetch(fileUrl);
    if (!pdfResponse.ok) {
      throw new Error(`Failed to download PDF: ${pdfResponse.status}`);
    }
    pdfBuffer = await pdfResponse.arrayBuffer();
  } catch (err) {
    console.error("Error downloading PDF:", err);
    return new Response(
      JSON.stringify({ error: "Failed to download PDF" }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // --- Upload PDF to storage ---
  const timestamp = Date.now();
  const fileName = `${document.title || "documento"}_assinado.pdf`
    .replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${opportunity.id}/${timestamp}_${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(storagePath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("Error uploading PDF:", uploadError);
    return new Response(
      JSON.stringify({ error: "Failed to upload PDF" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }

  // --- Create attachment record ---
  const { error: attachError } = await supabase.from("attachments").insert({
    organization_id: orgId,
    entity_type: "opportunity",
    entity_id: opportunity.id,
    file_name: `${document.title || "Documento"} - Assinado.pdf`,
    storage_path: storagePath,
    bucket: "attachments",
    mime_type: "application/pdf",
    size_bytes: pdfBuffer.byteLength,
  });

  if (attachError) {
    console.error("Error creating attachment record:", attachError);
  }

  // --- Create timeline activity ---
  const signatoryNames = signatories
    .map((s: any) => s.name || s.email)
    .join(", ");

  const completedAt = document.completed_at
    ? new Date(document.completed_at).toLocaleString("pt-BR", {
        dateStyle: "long",
        timeStyle: "short",
      })
    : "";

  const { error: activityError } = await supabase.from("activities").insert({
    organization_id: orgId,
    opportunity_id: opportunity.id,
    contact_id: contact_id || null,
    activity_type: "system",
    title: `Documento assinado: ${document.title || "Sem título"}`,
    body: `Assinado${completedAt ? ` em ${completedAt}` : ""}${signatoryNames ? ` por ${signatoryNames}` : ""}`,
  });

  if (activityError) {
    console.error("Error creating activity:", activityError);
  }

  console.log(
    `SuvSign webhook processed: document ${document.id} for opportunity ${opportunity.id}`
  );

  return new Response(
    JSON.stringify({ ok: true, opportunity_id: opportunity.id }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
