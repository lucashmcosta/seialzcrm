import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

    // ========== Configure the phone number to use the TwiML App ==========
    // This enables inbound calls to be routed to our webhook
    
    // Step 1: Find the phone number SID
    const phoneSearchUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(phoneNumber)}`
    
    console.log('Searching for phone number SID:', phoneNumber)
    
    let phoneNumberSid: string | null = null
    
    const phoneListResponse = await fetch(phoneSearchUrl, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      }
    })

    if (phoneListResponse.ok) {
      const phoneListData = await phoneListResponse.json()
      phoneNumberSid = phoneListData.incoming_phone_numbers?.[0]?.sid

      if (phoneNumberSid) {
        console.log('Found phone number SID:', phoneNumberSid)

        // Step 2: Update the phone number to use our TwiML App
        const updatePhoneUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${phoneNumberSid}.json`
        
        const updateForm = new URLSearchParams()
        updateForm.append('VoiceApplicationSid', twimlAppSid)
        
        const updateResponse = await fetch(updatePhoneUrl, {
          method: 'POST',
          headers: {
            'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: updateForm.toString(),
        })

        if (!updateResponse.ok) {
          const updateError = await updateResponse.text()
          console.error('Failed to configure phone number:', updateError)
          // Don't fail the entire setup - log warning but continue
        } else {
          console.log('Phone number configured to use TwiML App successfully')
        }
      } else {
        console.warn('Phone number not found in Twilio account. Inbound calls may not work.')
      }
    } else {
      const searchError = await phoneListResponse.text()
      console.error('Failed to search for phone number:', searchError)
    }
    // ========== END: Phone number configuration ==========

    // Initialize Supabase client
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the Twilio Voice integration ID
    const { data: twilioIntegration, error: integrationLookupError } = await supabase
      .from('admin_integrations')
      .select('id')
      .eq('slug', 'twilio-voice')
      .single()

    if (integrationLookupError || !twilioIntegration) {
      console.error('Error finding Twilio Voice integration:', integrationLookupError)
      return new Response(
        JSON.stringify({ error: 'Twilio Voice integration not found in admin_integrations' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Found Twilio Voice integration:', twilioIntegration.id)

    // UPSERT the organization integration with the TwiML App SID
    const { error: upsertError } = await supabase
      .from('organization_integrations')
      .upsert({
        organization_id: organizationId,
        integration_id: twilioIntegration.id,
        config_values: {
          account_sid: accountSid,
          auth_token: authToken,
          phone_number: phoneNumber,
          enable_recording: enableRecording || false,
          twiml_app_sid: twimlAppSid,
        },
        is_enabled: true,
        connected_at: new Date().toISOString(),
      }, {
        onConflict: 'organization_id,integration_id'
      })

    if (upsertError) {
      console.error('Error upserting integration:', upsertError)
      return new Response(
        JSON.stringify({ error: 'Failed to save integration config', details: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Integration saved successfully for organization:', organizationId)

    // ========== Insert/Update phone number in organization_phone_numbers ==========
    const { error: phoneInsertError } = await supabase
      .from('organization_phone_numbers')
      .upsert({
        organization_id: organizationId,
        phone_number: phoneNumber,
        friendly_name: 'Número Principal',
        twilio_phone_sid: phoneNumberSid,
        is_primary: true,
        ring_strategy: 'all',
        ring_timeout_seconds: 30,
      }, {
        onConflict: 'organization_id,phone_number'
      })

    if (phoneInsertError) {
      console.error('Error inserting phone number:', phoneInsertError)
      // Don't fail - this is not critical
    } else {
      console.log('Phone number registered in organization_phone_numbers')
    }
    // ========== END: Phone number registration ==========

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
