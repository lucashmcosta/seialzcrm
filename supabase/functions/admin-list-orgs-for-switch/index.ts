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

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Não autenticado');

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error('Usuário não autenticado');

    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('id, mfa_enabled, is_active')
      .eq('auth_user_id', user.id)
      .single();

    if (adminError || !adminUser || !adminUser.mfa_enabled || !adminUser.is_active) {
      throw new Error('Acesso negado');
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
