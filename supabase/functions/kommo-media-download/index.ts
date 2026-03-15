import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify auth
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Não autorizado" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get user's organization
    const { data: userOrg } = await supabase
      .from("user_organizations")
      .select("organization_id")
      .eq("user_id", user.id)
      .eq("is_active", true)
      .limit(1)
      .single();

    if (!userOrg) {
      return new Response(
        JSON.stringify({ error: "Organização não encontrada" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = userOrg.organization_id;
    const BATCH_SIZE = 10;
    const MAX_RETRIES = 3;

    // Fetch pending activities
    const { data: pendingActivities, error: fetchErr } = await supabase
      .from("activities")
      .select("id, media_source_url")
      .eq("organization_id", orgId)
      .eq("media_status", "pending")
      .not("media_source_url", "is", null)
      .limit(BATCH_SIZE);

    if (fetchErr) throw fetchErr;

    if (!pendingActivities || pendingActivities.length === 0) {
      return new Response(
        JSON.stringify({ success: true, processed: 0, message: "Nenhuma mídia pendente" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let failed = 0;

    for (const activity of pendingActivities) {
      try {
        // Download file from Kommo
        const response = await fetch(activity.media_source_url, {
          headers: { "User-Agent": "Seialz-CRM/1.0" },
        });

        if (!response.ok) {
          throw new Error(`Download failed: HTTP ${response.status}`);
        }

        const blob = await response.blob();
        const contentType = response.headers.get("content-type") || "application/octet-stream";

        // Determine file extension
        const extMap: Record<string, string> = {
          "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif",
          "image/webp": "webp", "video/mp4": "mp4", "audio/mpeg": "mp3",
          "audio/ogg": "ogg", "application/pdf": "pdf",
        };
        const ext = extMap[contentType] || "bin";
        const fileName = `${orgId}/${activity.id}.${ext}`;

        // Upload to Supabase Storage
        const { error: uploadErr } = await supabase.storage
          .from("kommo-media")
          .upload(fileName, blob, {
            contentType,
            upsert: true,
          });

        if (uploadErr) throw uploadErr;

        // Get public URL
        const { data: urlData } = supabase.storage
          .from("kommo-media")
          .getPublicUrl(fileName);

        // Update activity
        await supabase
          .from("activities")
          .update({
            media_storage_url: urlData.publicUrl,
            media_status: "downloaded",
          })
          .eq("id", activity.id);

        processed++;
      } catch (err: any) {
        console.error(`Failed to download media for activity ${activity.id}:`, err.message);

        // Check retry count from a simple approach — mark as failed after attempts
        // For simplicity, mark as failed immediately (can add retry counter later)
        await supabase
          .from("activities")
          .update({ media_status: "failed" })
          .eq("id", activity.id);

        failed++;
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        processed,
        failed,
        remaining: pendingActivities.length - processed - failed,
        message: `${processed} mídias processadas, ${failed} falhas`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Media download error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
