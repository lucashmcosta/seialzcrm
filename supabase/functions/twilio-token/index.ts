import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

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

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Verify the user token
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user's organization
    const { data: userProfile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return new Response(
        JSON.stringify({ error: 'User profile not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

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

    // Step 1: Get the Twilio integration ID from admin_integrations
    const { data: twilioIntegration } = await supabase
      .from('admin_integrations')
      .select('id')
      .or('slug.eq.twilio-voice,category.eq.telephony')
      .limit(1)
      .single()

    if (!twilioIntegration) {
      console.error('Twilio integration not found in admin_integrations')
      return new Response(
        JSON.stringify({ error: 'Twilio integration not available' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Found Twilio integration:', twilioIntegration.id)

    // Step 2: Get the organization's integration config
    const { data: integration } = await supabase
      .from('organization_integrations')
      .select('config_values')
      .eq('organization_id', userOrg.organization_id)
      .eq('integration_id', twilioIntegration.id)
      .eq('is_enabled', true)
      .single()

    if (!integration || !integration.config_values) {
      console.error('Organization integration not found or not configured')
      return new Response(
        JSON.stringify({ error: 'Twilio integration not configured for this organization' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Found organization integration with config')

    const config = integration.config_values as Record<string, string>
    const { account_sid, auth_token, twiml_app_sid } = config
    let { api_key_sid, api_key_secret } = config

    if (!account_sid || !twiml_app_sid) {
      return new Response(
        JSON.stringify({ error: 'Twilio configuration incomplete' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Check if we have API keys, if not, create them
    if (!api_key_sid || !api_key_secret) {
      // Create API Key via Twilio
      const createKeyUrl = `https://api.twilio.com/2010-04-01/Accounts/${account_sid}/Keys.json`
      
      const keyResponse = await fetch(createKeyUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${account_sid}:${auth_token}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          FriendlyName: `CRM API Key - ${userOrg.organization_id.slice(0, 8)}`
        }).toString()
      })

      if (!keyResponse.ok) {
        const errorText = await keyResponse.text()
        console.error('Failed to create API Key:', errorText)
        return new Response(
          JSON.stringify({ error: 'Failed to create API credentials' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const keyData = await keyResponse.json()
      api_key_sid = keyData.sid
      api_key_secret = keyData.secret

      // Save API key to integration config
      await supabase
        .from('organization_integrations')
        .update({
          config_values: {
            ...config,
            api_key_sid: api_key_sid,
            api_key_secret: api_key_secret,
          }
        })
        .eq('organization_id', userOrg.organization_id)
        .eq('integration_id', twilioIntegration.id)

      console.log('API Key created and saved:', api_key_sid)
    }

    // Generate Access Token using Web Crypto API
    const identity = `user-${userProfile.id}`
    const ttl = 3600 // 1 hour

    const header = {
      typ: 'JWT',
      alg: 'HS256',
      cty: 'twilio-fpa;v=1'
    }

    const now = Math.floor(Date.now() / 1000)
    
    const payload = {
      jti: `${api_key_sid}-${now}`,
      iss: api_key_sid,
      sub: account_sid,
      exp: now + ttl,
      grants: {
        identity: identity,
        voice: {
          outgoing: {
            application_sid: twiml_app_sid
          },
          incoming: {
            allow: true
          }
        }
      }
    }

    const base64UrlEncode = (obj: object) => {
      const str = JSON.stringify(obj)
      const bytes = new TextEncoder().encode(str)
      return btoa(String.fromCharCode(...bytes))
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
    }

    const headerB64 = base64UrlEncode(header)
    const payloadB64 = base64UrlEncode(payload)
    const message = `${headerB64}.${payloadB64}`

    // Create HMAC-SHA256 signature
    const encoder = new TextEncoder()
    const keyData = encoder.encode(api_key_secret)
    const messageData = encoder.encode(message)

    const cryptoKey = await crypto.subtle.importKey(
      'raw',
      keyData.buffer as ArrayBuffer,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    )
    
    const signature = await crypto.subtle.sign('HMAC', cryptoKey, messageData.buffer as ArrayBuffer)
    const signatureB64 = btoa(String.fromCharCode(...new Uint8Array(signature)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '')

    const accessToken = `${message}.${signatureB64}`

    console.log('Access token generated for identity:', identity)

    return new Response(
      JSON.stringify({ 
        token: accessToken,
        identity: identity,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Token generation error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
