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
    const { organizationId, accountSid, authToken, phoneNumber, enableRecording } = await req.json()

    if (!organizationId || !accountSid || !authToken || !phoneNumber) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    
    // Webhook URL for the TwiML App
    const webhookUrl = `${supabaseUrl}/functions/v1/twilio-webhook/voice?orgId=${organizationId}`

    console.log('Creating TwiML App with webhook URL:', webhookUrl)

    // Create TwiML Application via Twilio API
    const twilioApiUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Applications.json`
    
    const formData = new URLSearchParams()
    formData.append('FriendlyName', `CRM Voice App - ${organizationId.slice(0, 8)}`)
    formData.append('VoiceUrl', webhookUrl)
    formData.append('VoiceMethod', 'POST')

    const twilioResponse = await fetch(twilioApiUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    if (!twilioResponse.ok) {
      const errorText = await twilioResponse.text()
      console.error('Twilio API error:', errorText)
      return new Response(
        JSON.stringify({ error: 'Failed to create TwiML App', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const twilioData = await twilioResponse.json()
    const twimlAppSid = twilioData.sid

    console.log('TwiML App created successfully:', twimlAppSid)

    // Update the organization integration with the TwiML App SID
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { error: updateError } = await supabase
      .from('organization_integrations')
      .update({
        config_values: {
          account_sid: accountSid,
          auth_token: authToken,
          phone_number: phoneNumber,
          enable_recording: enableRecording || false,
          twiml_app_sid: twimlAppSid,
        }
      })
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(1)

    if (updateError) {
      console.error('Error updating integration:', updateError)
      return new Response(
        JSON.stringify({ error: 'Failed to save TwiML App SID' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        twimlAppSid,
        message: 'Twilio Voice configured successfully' 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Setup error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
