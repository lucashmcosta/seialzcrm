import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = "https://qvmtzfvkhkhkhdpclzua.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
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

    // Verify user from JWT
    const token = authHeader.replace('Bearer ', '');
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

    // Fetch the import log
    const { data: log, error: logError } = await supabase
      .from('import_logs')
      .select('*')
      .eq('id', import_log_id)
      .single();

    if (logError || !log) {
      return new Response(
        JSON.stringify({ error: "Log de importação não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if rollback is available
    if (!log.rollback_available) {
      return new Response(
        JSON.stringify({ error: "Rollback não disponível para esta importação" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if within 24 hours
    const completedAt = new Date(log.completed_at);
    const now = new Date();
    const hoursSinceCompletion = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60);
    
    if (hoursSinceCompletion > 24) {
      return new Response(
        JSON.stringify({ error: "Rollback só disponível até 24 horas após a migração" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to this organization
    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', log.organization_id)
      .eq('is_active', true)
      .single();

    if (!userOrg) {
      return new Response(
        JSON.stringify({ error: "Sem permissão para esta organização" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    let deletedOpportunities = 0;
    let deletedContacts = 0;

    // Delete imported opportunities first (due to foreign key constraints)
    if (log.imported_opportunity_ids && log.imported_opportunity_ids.length > 0) {
      const { error: oppError, count } = await supabase
        .from('opportunities')
        .delete({ count: 'exact' })
        .in('id', log.imported_opportunity_ids);

      if (oppError) {
        console.error("Error deleting opportunities:", oppError);
        throw new Error(`Erro ao deletar oportunidades: ${oppError.message}`);
      }
      deletedOpportunities = count || 0;
    }

    // Delete imported contacts
    if (log.imported_contact_ids && log.imported_contact_ids.length > 0) {
      // First, delete any related records that might have foreign keys
      // Activities
      await supabase
        .from('activities')
        .delete()
        .in('contact_id', log.imported_contact_ids);

      // Messages
      await supabase
        .from('messages')
        .delete()
        .in('contact_id', log.imported_contact_ids);

      // Notes (if exists)
      await supabase
        .from('notes')
        .delete()
        .in('contact_id', log.imported_contact_ids);

      // Now delete contacts
      const { error: contactError, count } = await supabase
        .from('contacts')
        .delete({ count: 'exact' })
        .in('id', log.imported_contact_ids);

      if (contactError) {
        console.error("Error deleting contacts:", contactError);
        throw new Error(`Erro ao deletar contatos: ${contactError.message}`);
      }
      deletedContacts = count || 0;
    }

    // Update the log to mark rollback as executed
    const { error: updateError } = await supabase
      .from('import_logs')
      .update({
        status: 'rolled_back',
        rollback_available: false,
        rollback_executed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', import_log_id);

    if (updateError) {
      console.error("Error updating log:", updateError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        deleted_contacts: deletedContacts,
        deleted_opportunities: deletedOpportunities,
        message: `Rollback concluído: ${deletedContacts} contatos e ${deletedOpportunities} oportunidades removidos.`,
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
