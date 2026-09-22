import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });

const ADMIN_PERMISSIONS = {
  can_view_contacts: true,
  can_edit_contacts: true,
  can_delete_contacts: true,
  can_view_opportunities: true,
  can_edit_opportunities: true,
  can_delete_opportunities: true,
  can_manage_settings: true,
  can_manage_users: true,
  can_manage_integrations: true,
  can_manage_billing: true,
};

const SALES_PERMISSIONS = {
  can_view_contacts: true,
  can_edit_contacts: true,
  can_view_opportunities: true,
  can_edit_opportunities: true,
};

function slugify(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'conta';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
  );

  let createdOrgId: string | null = null;

  try {
    // --- Auth: platform admin, active, MFA enabled (same pattern as admin-impersonate) ---
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) return json({ error: 'Não autenticado' }, 401);

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: 'Usuário não autenticado' }, 401);

    const { data: adminUser } = await supabase
      .from('admin_users')
      .select('id, email, is_active, mfa_enabled')
      .eq('auth_user_id', user.id)
      .maybeSingle();

    if (!adminUser || !adminUser.is_active || !adminUser.mfa_enabled) {
      return json({ error: 'Acesso negado' }, 403);
    }

    // --- Input ---
    const body = await req.json().catch(() => ({}));
    const orgName = String(body?.organizationName ?? '').trim();
    const email = String(body?.email ?? '').trim().toLowerCase();
    const fullName = String(body?.fullName ?? '').trim();
    const password = String(body?.password ?? '');
    const countryCode = String(body?.operatingCountryCode ?? 'BR').trim().toUpperCase();
    const planName = String(body?.planName ?? 'free').trim().toLowerCase();

    if (!orgName) return json({ error: 'Informe o nome da conta.' }, 400);
    if (!fullName) return json({ error: 'Informe o nome do administrador.' }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'E-mail inválido.' }, 400);

    const { data: existingUser } = await supabase
      .from('users')
      .select('id, auth_user_id, email, full_name')
      .ilike('email', email)
      .maybeSingle();

    if (!existingUser && password.length < 8) {
      return json({ error: 'A senha inicial deve ter ao menos 8 caracteres.' }, 400);
    }

    const { data: plan } = await supabase
      .from('plans')
      .select('id, name, max_seats, price_per_seat_monthly')
      .eq('name', planName)
      .eq('is_active', true)
      .maybeSingle();

    if (!plan) return json({ error: 'Plano inválido.' }, 400);

    // --- Unique slug ---
    const base = slugify(orgName);
    let slug = base;
    for (let attempt = 0; attempt < 6; attempt++) {
      const { data: taken } = await supabase
        .from('organizations')
        .select('id')
        .eq('slug', slug)
        .maybeSingle();
      if (!taken) break;
      slug = `${base}-${crypto.randomUUID().slice(0, 8)}`;
    }

    // --- Organization ---
    const { data: org, error: orgError } = await supabase
      .from('organizations')
      .insert({
        name: orgName,
        slug,
        operating_country_code: countryCode || null,
        onboarding_step: 'invites',
      })
      .select('id, name, slug')
      .single();

    if (orgError || !org) throw new Error(orgError?.message ?? 'Falha ao criar a conta');
    createdOrgId = org.id;

    // --- Permission profiles ---
    const { data: profiles, error: profilesError } = await supabase
      .from('permission_profiles')
      .insert([
        { organization_id: org.id, name: 'Admin', permissions: ADMIN_PERMISSIONS },
        { organization_id: org.id, name: 'Sales Rep', permissions: SALES_PERMISSIONS },
      ])
      .select('id, name');

    if (profilesError) throw new Error(profilesError.message);
    const adminProfileId = profiles?.find((p) => p.name === 'Admin')?.id;
    if (!adminProfileId) throw new Error('Falha ao criar o perfil Admin');

    // --- Pipeline stages ---
    const { error: stagesError } = await supabase.from('pipeline_stages').insert([
      { organization_id: org.id, name: 'Novo', order_index: 1, type: 'custom' },
      { organization_id: org.id, name: 'Em negociação', order_index: 2, type: 'custom' },
      { organization_id: org.id, name: 'Ganho', order_index: 100, type: 'won' },
      { organization_id: org.id, name: 'Perdido', order_index: 101, type: 'lost' },
    ]);
    if (stagesError) throw new Error(stagesError.message);

    // --- WhatsApp routes (messaging_lines) ---
    // Semeadas automaticamente pela trigger `trg_seed_default_messaging_lines`
    // em public.organizations (Comercial + Atendimento, channel='whatsapp').
    // Não inserir aqui: a trigger é a única fonte, para qualquer caminho de
    // criação de conta (Portal Admin, signup, insert direto).
    const { data: seededLines, error: linesError } = await supabase
      .from('messaging_lines')
      .select('id, key')
      .eq('organization_id', org.id)
      .eq('channel', 'whatsapp');
    if (linesError) throw new Error(`Falha ao verificar as rotas de WhatsApp: ${linesError.message}`);
    const seededKeys = new Set((seededLines ?? []).map((l: { key: string }) => l.key));
    if (!seededKeys.has('commercial') || !seededKeys.has('customer_service')) {
      throw new Error('Rotas de WhatsApp (Comercial/Atendimento) não foram criadas para a nova conta');
    }


    // --- Subscription ---
    const { error: subError } = await supabase.from('subscriptions').insert({
      organization_id: org.id,
      plan_id: plan.id,
      plan_name: plan.name,
      status: 'active',
      is_free_plan: plan.name === 'free',
      max_seats: plan.max_seats ?? 3,
      price_per_seat: plan.price_per_seat_monthly ?? 0,
    });
    if (subError) throw new Error(subError.message);

    // --- First admin user ---
    let internalUserId = existingUser?.id ?? null;
    let userWasCreated = false;

    if (!internalUserId) {
      const { data: created, error: createError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: fullName },
      });
      if (createError || !created?.user) {
        throw new Error(createError?.message ?? 'Falha ao criar o usuário');
      }
      userWasCreated = true;
      const authUserId = created.user.id;

      // The auth trigger (handle_new_user) creates a users row and an extra
      // organization. Reuse the users row and remove the auto-created org.
      const { data: triggerUser } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (triggerUser) {
        internalUserId = triggerUser.id;
        const { data: autoLinks } = await supabase
          .from('user_organizations')
          .select('id, organization_id')
          .eq('user_id', triggerUser.id);

        for (const link of autoLinks ?? []) {
          if (link.organization_id === org.id) continue;
          await supabase.from('user_organizations').delete().eq('id', link.id);
          await supabase.from('pipeline_stages').delete().eq('organization_id', link.organization_id);
          await supabase.from('messaging_lines').delete().eq('organization_id', link.organization_id);
          await supabase.from('permission_profiles').delete().eq('organization_id', link.organization_id);
          await supabase.from('subscriptions').delete().eq('organization_id', link.organization_id);
          await supabase.from('intelligence_settings').delete().eq('organization_id', link.organization_id);
          await supabase.from('organizations').delete().eq('id', link.organization_id);
        }
      } else {
        const first = fullName.split(' ')[0];
        const last = fullName.includes(' ') ? fullName.slice(fullName.indexOf(' ') + 1) : null;
        const { data: inserted, error: insertError } = await supabase
          .from('users')
          .insert({
            auth_user_id: authUserId,
            email,
            full_name: fullName,
            first_name: first,
            last_name: last,
          })
          .select('id')
          .single();
        if (insertError || !inserted) throw new Error(insertError?.message ?? 'Falha ao criar o usuário');
        internalUserId = inserted.id;
      }
    }

    const { error: linkError } = await supabase.from('user_organizations').insert({
      user_id: internalUserId,
      organization_id: org.id,
      permission_profile_id: adminProfileId,
      is_active: true,
    });
    if (linkError) throw new Error(linkError.message);

    await supabase.from('admin_audit_logs').insert({
      admin_user_id: adminUser.id,
      action: 'create_organization',
      entity_type: 'organization',
      entity_id: org.id,
      details: {
        organization_name: org.name,
        slug: org.slug,
        plan_name: plan.name,
        operating_country_code: countryCode || null,
        first_admin_email: email,
        first_admin_user_id: internalUserId,
        user_was_created: userWasCreated,
      },
    });

    return json({
      success: true,
      organization: { id: org.id, name: org.name, slug: org.slug },
      user: { id: internalUserId, email, created: userWasCreated },
    });
  } catch (error) {
    // Best-effort rollback of the organization we created in this request.
    if (createdOrgId) {
      await supabase.from('user_organizations').delete().eq('organization_id', createdOrgId);
      await supabase.from('pipeline_stages').delete().eq('organization_id', createdOrgId);
      await supabase.from('messaging_lines').delete().eq('organization_id', createdOrgId);
      await supabase.from('permission_profiles').delete().eq('organization_id', createdOrgId);
      await supabase.from('subscriptions').delete().eq('organization_id', createdOrgId);
      await supabase.from('intelligence_settings').delete().eq('organization_id', createdOrgId);
      await supabase.from('organizations').delete().eq('id', createdOrgId);
    }
    const message = error instanceof Error ? error.message : 'Erro inesperado';
    console.error('admin-create-organization error:', message);
    return json({ error: message }, 400);
  }
});
