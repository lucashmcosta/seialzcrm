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
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const email = 'tavares@centraltrabalhista.com.br';
    const full_name = 'Tavares';
    const password = '123456';
    const organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';
    const permission_profile_id = 'd0639f2f-8cdb-4c46-905c-04e27f4913f8';

    // Create auth user
    const { data: newAuthUser, error: createAuthError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name },
    });

    if (createAuthError || !newAuthUser.user) {
      return new Response(JSON.stringify({ error: createAuthError?.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('Auth user created:', newAuthUser.user.id);

    // Wait for trigger to create user record
    await new Promise(r => setTimeout(r, 2000));

    const { data: existingUser } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('auth_user_id', newAuthUser.user.id)
      .single();

    if (!existingUser) {
      return new Response(JSON.stringify({ error: 'User record not created by trigger' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log('User record found:', existingUser.id);

    // Update name
    await supabaseAdmin
      .from('users')
      .update({ full_name, first_name: 'Tavares', last_name: null })
      .eq('id', existingUser.id);

    // Clean up auto-created org
    const { data: autoMembership } = await supabaseAdmin
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', existingUser.id)
      .single();

    if (autoMembership && autoMembership.organization_id !== organization_id) {
      const autoOrgId = autoMembership.organization_id;
      console.log('Cleaning up auto-org:', autoOrgId);
      
      await supabaseAdmin.from('subscriptions').delete().eq('organization_id', autoOrgId);
      await supabaseAdmin.from('pipeline_stages').delete().eq('organization_id', autoOrgId);
      await supabaseAdmin.from('permission_profiles').delete().eq('organization_id', autoOrgId);
      await supabaseAdmin.from('user_organizations').delete().eq('organization_id', autoOrgId);
      await supabaseAdmin.from('organizations').delete().eq('id', autoOrgId);
    }

    // Delete any existing membership
    await supabaseAdmin
      .from('user_organizations')
      .delete()
      .eq('user_id', existingUser.id);

    // Create membership in target org
    const { error: memberError } = await supabaseAdmin
      .from('user_organizations')
      .insert({
        user_id: existingUser.id,
        organization_id,
        permission_profile_id,
        is_active: true,
      });

    if (memberError) {
      return new Response(JSON.stringify({ error: 'Membership error: ' + memberError.message }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ 
      success: true, 
      user_id: existingUser.id,
      email,
    }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
