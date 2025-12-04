import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface CallRequest {
  to: string
  contactId?: string
  opportunityId?: string
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    )

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser()
    if (authError || !user) {
      console.error('Auth error:', authError)
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: userProfile } = await supabaseClient
      .from('users')
      .select('id, full_name')
      .eq('auth_user_id', user.id)
      .single()

    if (!userProfile) {
      return new Response(JSON.stringify({ error: 'User profile not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: userOrg } = await supabaseClient
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userProfile.id)
      .eq('is_active', true)
      .single()

    if (!userOrg) {
      return new Response(JSON.stringify({ error: 'Organization not found' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Use service role to access organization_integrations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { data: integration } = await supabaseAdmin
      .from('organization_integrations')
      .select(`
        config_values,
        admin_integrations!inner(slug)
      `)
      .eq('organization_id', userOrg.organization_id)
      .eq('admin_integrations.slug', 'twilio-voice')
      .eq('is_enabled', true)
      .single()

    if (!integration) {
      return new Response(JSON.stringify({ error: 'Twilio Voice not configured. Please connect Twilio in Settings > Integrations.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const twilioConfig = integration.config_values as {
      account_sid: string
      auth_token: string
      phone_number: string
      enable_recording?: boolean
    }

    if (!twilioConfig.account_sid || !twilioConfig.auth_token || !twilioConfig.phone_number) {
      return new Response(JSON.stringify({ error: 'Twilio configuration incomplete' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { to, contactId, opportunityId }: CallRequest = await req.json()

    if (!to) {
      return new Response(JSON.stringify({ error: 'Phone number required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const webhookBaseUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-webhook`
    
    const twilioResponse = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${twilioConfig.account_sid}/Calls.json`,
      {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioConfig.account_sid}:${twilioConfig.auth_token}`),
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          To: twilioConfig.phone_number,
          From: twilioConfig.phone_number,
          Url: `${webhookBaseUrl}/twiml?to=${encodeURIComponent(to)}&orgId=${userOrg.organization_id}`,
          StatusCallback: `${webhookBaseUrl}/status?orgId=${userOrg.organization_id}`,
          StatusCallbackEvent: 'initiated ringing answered completed',
          StatusCallbackMethod: 'POST',
          ...(twilioConfig.enable_recording ? {
            Record: 'true',
            RecordingStatusCallback: `${webhookBaseUrl}/recording?orgId=${userOrg.organization_id}`,
          } : {}),
        }).toString(),
      }
    )

    const twilioData = await twilioResponse.json()

    if (!twilioResponse.ok) {
      console.error('Twilio error:', twilioData)
      return new Response(JSON.stringify({ error: twilioData.message || 'Twilio error' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const { data: callRecord, error: insertError } = await supabaseAdmin
      .from('calls')
      .insert({
        organization_id: userOrg.organization_id,
        contact_id: contactId || null,
        opportunity_id: opportunityId || null,
        user_id: userProfile.id,
        call_type: 'made',
        call_sid: twilioData.sid,
        from_number: twilioConfig.phone_number,
        to_number: to,
        direction: 'outgoing',
        status: 'queued',
        started_at: new Date().toISOString(),
      })
      .select()
      .single()

    if (insertError) {
      console.error('Error inserting call:', insertError)
    }

    console.log(`Call initiated: ${twilioData.sid} from ${twilioConfig.phone_number} to ${to}`)

    return new Response(JSON.stringify({
      success: true,
      callSid: twilioData.sid,
      callId: callRecord?.id,
      status: 'queued'
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (error: unknown) {
    console.error('Error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
