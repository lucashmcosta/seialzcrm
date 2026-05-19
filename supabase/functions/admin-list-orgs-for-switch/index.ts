import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    let sessionId: string | null = null;
    try {
      const body = await req.json();
      sessionId = body?.sessionId ?? null;
    } catch (_) {
      // no body
    }
    if (!sessionId) throw new Error('sessionId obrigatório');

    const { data: impSession, error: impErr } = await supabase
      .from('impersonation_sessions')
      .select('id, status, ended_at')
      .eq('id', sessionId)
      .eq('status', 'active')
      .is('ended_at', null)
      .maybeSingle();

    if (impErr || !impSession) {
      throw new Error('Sessão de impersonação inválida');
    }

    // Orgs with at least one active user
    const { data: orgs, error: orgsError } = await supabase
      .from('organizations')
      .select('id, name, slug, logo_url, user_organizations!inner(id)')
      .eq('user_organizations.is_active', true)
      .order('name', { ascending: true });

    if (orgsError) throw orgsError;

    // Deduplicate (inner join may return multiple rows per org)
    const seen = new Set<string>();
    const unique = (orgs ?? [])
      .filter((o: any) => {
        if (seen.has(o.id)) return false;
        seen.add(o.id);
        return true;
      })
      .map((o: any) => ({ id: o.id, name: o.name, slug: o.slug, logo_url: o.logo_url }));

    return new Response(
      JSON.stringify({ organizations: unique }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in admin-list-orgs-for-switch:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro desconhecido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
