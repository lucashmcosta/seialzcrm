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

    const { currentSessionId, targetOrganizationId, redirectUrl } = await req.json();
    if (!targetOrganizationId) throw new Error('targetOrganizationId é obrigatório');

    let adminUser: any = null;

    if (currentSessionId) {
      // Mode A: caller is the impersonated user, authorize via active impersonation session
      const { data: activeImp, error: activeImpErr } = await supabase
        .from('impersonation_sessions')
        .select('id, admin_user_id, status, ended_at')
        .eq('id', currentSessionId)
        .eq('status', 'active')
        .is('ended_at', null)
        .maybeSingle();

      if (activeImpErr || !activeImp) throw new Error('Sessão de impersonação inválida');

      const { data: au, error: adminError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('id', activeImp.admin_user_id)
        .single();

      if (adminError || !au || !au.mfa_enabled || !au.is_active) {
        throw new Error('Acesso negado');
      }
      adminUser = au;
    } else {
      // Mode B: caller is the admin himself (admin portal), authorize via JWT
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) throw new Error('Não autenticado');
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) throw new Error('Usuário não autenticado');

      const { data: au, error: adminError } = await supabase
        .from('admin_users')
        .select('*')
        .eq('auth_user_id', user.id)
        .single();

      if (adminError || !au || !au.mfa_enabled || !au.is_active) {
        throw new Error('Acesso negado');
      }
      adminUser = au;
    }

    // 1) End current session
    let fromOrgId: string | null = null;
    if (currentSessionId) {
      const { data: currentSession } = await supabase
        .from('impersonation_sessions')
        .select('started_at, organization_id')
        .eq('id', currentSessionId)
        .maybeSingle();

      if (currentSession) {
        fromOrgId = currentSession.organization_id;
        const endedAt = new Date();
        const startedAt = new Date(currentSession.started_at);
        const durationSeconds = Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000);

        await supabase
          .from('impersonation_sessions')
          .update({
            ended_at: endedAt.toISOString(),
            duration_seconds: durationSeconds,
            status: 'ended',
          })
          .eq('id', currentSessionId);
      }
    }

    // 2) Pick target user (first active in org by created_at)
    const { data: membership, error: memError } = await supabase
      .from('user_organizations')
      .select('user_id, users!inner(id, email, full_name)')
      .eq('organization_id', targetOrganizationId)
      .eq('is_active', true)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    if (memError || !membership) {
      throw new Error('Organização sem usuário ativo');
    }

    const targetUser: any = membership.users;

    // 3) Generate magic link
    const { data: sessionData, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: targetUser.email,
      options: redirectUrl ? { redirectTo: redirectUrl } : undefined,
    });
    if (sessionError || !sessionData) throw new Error('Falha ao gerar sessão');

    // 4) New impersonation session
    const { data: impSession, error: impError } = await supabase
      .from('impersonation_sessions')
      .insert({
        admin_user_id: adminUser.id,
        target_user_id: targetUser.id,
        target_user_email: targetUser.email,
        target_user_name: targetUser.full_name,
        organization_id: targetOrganizationId,
        status: 'active',
      })
      .select()
      .single();

    if (impError) console.error('Error creating impersonation session:', impError);

    await supabase.from('admin_audit_logs').insert({
      admin_user_id: adminUser.id,
      action: 'impersonate_switch',
      entity_type: 'organization',
      entity_id: targetOrganizationId,
      details: {
        from_org_id: fromOrgId,
        to_org_id: targetOrganizationId,
        previous_session_id: currentSessionId ?? null,
        new_session_id: impSession?.id ?? null,
        target_email: targetUser.email,
      },
    });

    const magicLinkUrl = new URL(sessionData.properties.action_link);
    if (impSession) {
      const innerRedirect = magicLinkUrl.searchParams.get('redirect_to');
      if (innerRedirect) {
        try {
          const inner = new URL(innerRedirect);
          inner.searchParams.set('imp_session', impSession.id);
          magicLinkUrl.searchParams.set('redirect_to', inner.toString());
        } catch (_) {
          magicLinkUrl.searchParams.set('imp_session', impSession.id);
        }
      } else {
        magicLinkUrl.searchParams.set('imp_session', impSession.id);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        action_link: magicLinkUrl.toString(),
        session_id: impSession?.id,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in admin-impersonate-switch:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Erro desconhecido' }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
