import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const mediaUrl = url.searchParams.get('url');
    const organizationId = url.searchParams.get('orgId');

    if (!mediaUrl || !organizationId) {
      return new Response(JSON.stringify({ error: 'Missing url or orgId' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate target host
    let target: URL;
    try {
      target = new URL(mediaUrl);
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid url' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    if (target.hostname !== 'api.twilio.com') {
      return new Response(JSON.stringify({ error: 'Only api.twilio.com is allowed' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Verify caller session — accept token in header OR query (audio elements can't set headers)
    const authHeader = req.headers.get('Authorization');
    const queryToken = url.searchParams.get('access_token');
    const token = authHeader ? authHeader.replace('Bearer ', '') : queryToken;
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Map auth user -> internal users.id and verify membership
    const { data: profile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', userData.user.id)
      .single();

    if (!profile) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: membership } = await supabase
      .from('user_organizations')
      .select('id')
      .eq('user_id', profile.id)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .maybeSingle();

    if (!membership) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Load Twilio credentials for the org (any twilio-* integration that has account_sid/auth_token)
    const { data: integrations } = await supabase
      .from('organization_integrations')
      .select('config_values, admin_integrations!inner(slug)')
      .eq('organization_id', organizationId)
      .eq('is_enabled', true);

    let accountSid: string | undefined;
    let authToken: string | undefined;
    for (const it of integrations ?? []) {
      const cfg = (it as any).config_values || {};
      if (cfg.account_sid && cfg.auth_token) {
        accountSid = cfg.account_sid;
        authToken = cfg.auth_token;
        break;
      }
    }

    if (!accountSid || !authToken) {
      return new Response(JSON.stringify({ error: 'Twilio credentials not configured' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const basic = btoa(`${accountSid}:${authToken}`);

    // Twilio returns 307 to the actual CDN; follow redirect (no auth needed on CDN)
    const upstream = await fetch(target.toString(), {
      headers: { Authorization: `Basic ${basic}` },
      redirect: 'follow',
    });

    if (!upstream.ok || !upstream.body) {
      const text = await upstream.text().catch(() => '');
      return new Response(JSON.stringify({ error: 'Upstream error', status: upstream.status, body: text.slice(0, 500) }), {
        status: 502,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const headers = new Headers(corsHeaders);
    const contentType = upstream.headers.get('Content-Type');
    if (contentType) headers.set('Content-Type', contentType);
    const contentLength = upstream.headers.get('Content-Length');
    if (contentLength) headers.set('Content-Length', contentLength);
    headers.set('Cache-Control', 'private, max-age=3600');
    headers.set('Accept-Ranges', 'bytes');

    return new Response(upstream.body, { status: 200, headers });
  } catch (e) {
    console.error('twilio-media-proxy error', e);
    return new Response(JSON.stringify({ error: 'Internal error', detail: (e as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
