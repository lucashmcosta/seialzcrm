import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://qvmtzfvkhkhkhdpclzua.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
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

    const { import_log_id } = await req.json();
    if (!import_log_id) {
      return new Response(
        JSON.stringify({ error: "import_log_id é obrigatório" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: log, error: logError } = await supabase
      .from("import_logs")
      .select("*")
      .eq("id", import_log_id)
      .single();

    if (logError || !log) {
      return new Response(
        JSON.stringify({ error: "Log de importação não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!log.rollback_available) {
      return new Response(
        JSON.stringify({ error: "Rollback não disponível para esta importação" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check 24-hour window
    if (log.completed_at) {
      const hoursSince = (Date.now() - new Date(log.completed_at).getTime()) / (1000 * 60 * 60);
      if (hoursSince > 24) {
        return new Response(
          JSON.stringify({ error: "Rollback só disponível até 24 horas após a migração" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Verify org access
    const { data: userOrg } = await supabase
      .from("user_organizations")
      .select("id")
      .eq("user_id", user.id)
      .eq("organization_id", log.organization_id)
      .eq("is_active", true)
      .single();

    if (!userOrg) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para esta organização" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const orgId = log.organization_id;
    const results: Record<string, number> = {};

    // Helper to batch delete by IDs
    async function batchDelete(table: string, ids: string[], key = "id"): Promise<number> {
      if (!ids || ids.length === 0) return 0;
      // Delete in chunks of 500 to avoid query limits
      let total = 0;
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const { count } = await supabase
          .from(table)
          .delete({ count: "exact" })
          .in(key, chunk);
        total += count || 0;
      }
      return total;
    }

    // 1. Delete events (activities with kommo_event_ source)
    if (log.imported_activity_ids?.length > 0) {
      // Activities include both notes and events — delete all imported activities
      results.activities = await batchDelete("activities", log.imported_activity_ids);
    }

    // 2. Delete custom_field_values for imported records
    const allImportedRecordIds = [
      ...(log.imported_contact_ids || []),
      ...(log.imported_opportunity_ids || []),
      ...(log.imported_company_ids || []),
    ];
    if (allImportedRecordIds.length > 0) {
      let cfvTotal = 0;
      for (let i = 0; i < allImportedRecordIds.length; i += 500) {
        const chunk = allImportedRecordIds.slice(i, i + 500);
        const { count } = await supabase
          .from("custom_field_values")
          .delete({ count: "exact" })
          .eq("organization_id", orgId)
          .in("record_id", chunk);
        cfvTotal += count || 0;
      }
      results.custom_field_values = cfvTotal;
    }

    // 3. Delete tasks
    if (log.imported_task_ids?.length > 0) {
      results.tasks = await batchDelete("tasks", log.imported_task_ids);
    }

    // 4. Delete opportunities (before contacts due to FK)
    if (log.imported_opportunity_ids?.length > 0) {
      results.opportunities = await batchDelete("opportunities", log.imported_opportunity_ids);
    }

    // 5. Delete contacts
    if (log.imported_contact_ids?.length > 0) {
      // First clean up related records
      for (let i = 0; i < log.imported_contact_ids.length; i += 500) {
        const chunk = log.imported_contact_ids.slice(i, i + 500);
        await supabase.from("activities").delete().in("contact_id", chunk);
        await supabase.from("messages").delete().in("contact_id", chunk);
      }
      results.contacts = await batchDelete("contacts", log.imported_contact_ids);
    }

    // 6. Delete companies
    if (log.imported_company_ids?.length > 0) {
      results.companies = await batchDelete("companies", log.imported_company_ids);
    }

    // 7. Delete custom_field_definitions (after values due to FK)
    const { count: cfdCount } = await supabase
      .from("custom_field_definitions")
      .delete({ count: "exact" })
      .eq("organization_id", orgId)
      .like("source_external_id", "kommo_field_%");
    results.custom_field_definitions = cfdCount || 0;

    // 8. Delete kommo_user_mappings
    const { count: kumCount } = await supabase
      .from("kommo_user_mappings")
      .delete({ count: "exact" })
      .eq("organization_id", orgId);
    results.user_mappings = kumCount || 0;

    // Update log
    await supabase
      .from("import_logs")
      .update({
        status: "rolled_back",
        rollback_available: false,
        rollback_executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", import_log_id);

    const summary = Object.entries(results)
      .filter(([, v]) => v > 0)
      .map(([k, v]) => `${v} ${k}`)
      .join(", ");

    return new Response(
      JSON.stringify({
        success: true,
        results,
        deleted_contacts: results.contacts || 0,
        deleted_opportunities: results.opportunities || 0,
        message: `Rollback concluído: ${summary || "nenhum registro removido"}.`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Rollback error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Erro interno ao executar rollback" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
