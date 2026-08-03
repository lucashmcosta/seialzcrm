import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import { TwilioVoiceAdapter } from "../_shared/telephony/twilio.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Auth client (anon) — used to verify caller JWT via getClaims
    const supabaseAuth = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? ''
    )

    // Service-role client — used for privileged DB reads/writes below
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the user token (signing-keys compatible)
    const token = authHeader.replace('Bearer ', '')
    const { data: claimsData, error: authError } = await supabaseAuth.auth.getClaims(token)
    const authUserId = claimsData?.claims?.sub

    if (authError || !authUserId) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's organization
    const { data: userProfile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', authUserId)
      .single()

    if (!userProfile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Parse request body for organizationId (optional, for validation)
    let requestedOrgId: string | null = null
    try {
      const body = await req.json()
      requestedOrgId = body?.organizationId || null
    } catch {
      // No body or not JSON, will use default org
    }

    // Get user's active organization
    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userProfile.id)
      .eq('is_active', true)
      .single()

    if (!userOrg) {
      return new Response(
        JSON.stringify({ error: 'Organization not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // SECURITY: If organizationId was provided, validate user has access to it
    const targetOrgId = requestedOrgId || userOrg.organization_id
    
    if (requestedOrgId && requestedOrgId !== userOrg.organization_id) {
      // Verify user belongs to the requested organization
      const { data: membership } = await supabase
        .from('user_organizations')
        .select('organization_id')
        .eq('user_id', userProfile.id)
        .eq('organization_id', requestedOrgId)
        .eq('is_active', true)
        .single()

      if (!membership) {
        console.error('User not authorized for organization:', requestedOrgId)
        return new Response(
          JSON.stringify({ error: 'User not authorized for this organization' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
    }

    const voiceSession = await new TwilioVoiceAdapter(supabase).issueSession({
      organizationId: targetOrgId,
      userId: userProfile.id,
    })
    return new Response(JSON.stringify({ token: voiceSession.token, identity: voiceSession.identity }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    console.error('Token generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
