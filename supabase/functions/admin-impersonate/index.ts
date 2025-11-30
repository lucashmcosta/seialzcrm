import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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

    // Get admin user from auth header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Não autenticado');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      throw new Error('Usuário não autenticado');
    }

    // Verify admin user
    const { data: adminUser, error: adminError } = await supabase
      .from('admin_users')
      .select('*')
      .eq('auth_user_id', user.id)
      .single();

    if (adminError || !adminUser || !adminUser.mfa_enabled || !adminUser.is_active) {
      throw new Error('Acesso negado');
    }

    // Get target user from request body
    const { userId } = await req.json();

    if (!userId) {
      throw new Error('userId é obrigatório');
    }

    // Get target user data
    const { data: targetUser, error: targetError } = await supabase
      .from('users')
      .select('*, user_organizations!inner(organization_id)')
      .eq('id', userId)
      .single();

    if (targetError || !targetUser) {
      throw new Error('Usuário não encontrado');
    }

    // Generate impersonation session
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email,
    });

    if (sessionError || !sessionData) {
      throw new Error('Falha ao gerar sessão');
    }

    // Log impersonation action
    await supabase.from('admin_audit_logs').insert({
      admin_user_id: adminUser.id,
      action: 'impersonate_user',
      entity_type: 'user',
      entity_id: userId,
      details: {
        target_email: targetUser.email,
        target_name: targetUser.full_name,
      },
    });

    console.log(`Admin ${adminUser.email} impersonating user ${targetUser.email}`);

    return new Response(
      JSON.stringify({
        success: true,
        session: sessionData,
        user: {
          id: targetUser.id,
          email: targetUser.email,
          name: targetUser.full_name,
        },
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error: any) {
    console.error('Error in admin-impersonate:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro desconhecido' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
