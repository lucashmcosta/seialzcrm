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
    const { organizationId, accountSid, authToken, whatsappNumber, useSandbox } = await req.json()

    if (!organizationId || !accountSid || !authToken || !whatsappNumber) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Setting up WhatsApp for organization:', organizationId)

    // Validate Twilio credentials
    const accountUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`
    
    const accountResponse = await fetch(accountUrl, {
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
      }
    })

    if (!accountResponse.ok) {
      const errorText = await accountResponse.text()
      console.error('Twilio credentials validation failed:', errorText)
      return new Response(
        JSON.stringify({ error: 'Invalid Twilio credentials', details: errorText }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const accountData = await accountResponse.json()
    console.log('Twilio account validated:', accountData.friendly_name)

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    
    // Webhook URLs
    const inboundWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/inbound?orgId=${organizationId}`
    const statusWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/status?orgId=${organizationId}`

    console.log('Webhook URLs:', { inboundWebhookUrl, statusWebhookUrl })

    // Format WhatsApp number
    const formattedNumber = whatsappNumber.startsWith('+') ? whatsappNumber : `+${whatsappNumber}`
    const whatsappFrom = useSandbox ? 'whatsapp:+14155238886' : `whatsapp:${formattedNumber}`

    // If not sandbox, try to configure webhook on the phone number
    let phoneNumberSid: string | null = null
    
    if (!useSandbox) {
      // Search for the phone number in Twilio
      const phoneSearchUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PhoneNumber=${encodeURIComponent(formattedNumber)}`
      
      const phoneListResponse = await fetch(phoneSearchUrl, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        }
      })

      if (phoneListResponse.ok) {
        const phoneListData = await phoneListResponse.json()
        const phoneData = phoneListData.incoming_phone_numbers?.[0]
        
        if (phoneData) {
          phoneNumberSid = phoneData.sid
          console.log('Found phone number SID:', phoneNumberSid)

          // Note: WhatsApp webhook configuration is typically done via Twilio Console
          // or via WhatsApp Sender configuration, not directly on the phone number
          // The user may need to configure this manually in Twilio Console
        }
      }
    }

    // Sync existing templates from Twilio Content API
    const templatesUrl = 'https://content.twilio.com/v1/Content'
    
    let templates: any[] = []
    
    try {
      const templatesResponse = await fetch(templatesUrl, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        }
      })

      if (templatesResponse.ok) {
        const templatesData = await templatesResponse.json()
        templates = templatesData.contents || []
        console.log('Found', templates.length, 'templates in Twilio')
      } else {
        console.warn('Could not fetch templates:', await templatesResponse.text())
      }
    } catch (e) {
      console.warn('Error fetching templates:', e)
    }

    // Initialize Supabase client
    const supabase = createClient(
      supabaseUrl,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get the integration ID for twilio-whatsapp
    const { data: adminIntegration } = await supabase
      .from('admin_integrations')
      .select('id')
      .eq('slug', 'twilio-whatsapp')
      .single()

    if (!adminIntegration) {
      return new Response(
        JSON.stringify({ error: 'WhatsApp integration not found in admin_integrations' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert organization integration
    const { error: upsertError } = await supabase
      .from('organization_integrations')
      .upsert({
        organization_id: organizationId,
        integration_id: adminIntegration.id,
        is_enabled: true,
        connected_at: new Date().toISOString(),
        config_values: {
          account_sid: accountSid,
          auth_token: authToken,
          whatsapp_number: formattedNumber,
          whatsapp_from: whatsappFrom,
          use_sandbox: useSandbox || false,
          phone_number_sid: phoneNumberSid,
          inbound_webhook_url: inboundWebhookUrl,
          status_webhook_url: statusWebhookUrl,
        }
      }, {
        onConflict: 'organization_id,integration_id'
      })

    if (upsertError) {
      console.error('Error saving integration:', upsertError)
      return new Response(
        JSON.stringify({ error: 'Failed to save integration config' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Sync templates to database
    let syncedTemplates = 0
    
    for (const template of templates) {
      // Extract template info
      const types = template.types || {}
      const whatsappType = types['twilio/whatsapp'] || types['twilio/text'] || {}
      
      const { error: templateError } = await supabase
        .from('whatsapp_templates')
        .upsert({
          organization_id: organizationId,
          twilio_content_sid: template.sid,
          friendly_name: template.friendly_name || template.sid,
          language: template.language || 'pt_BR',
          template_type: 'text',
          body: whatsappType.body || '',
          variables: template.variables || [],
          status: 'approved', // If it's in Content API, it's approved
          category: 'utility',
          last_synced_at: new Date().toISOString(),
        }, {
          onConflict: 'organization_id,twilio_content_sid'
        })

      if (!templateError) {
        syncedTemplates++
      } else {
        console.warn('Error syncing template:', template.sid, templateError)
      }
    }

    console.log('Synced', syncedTemplates, 'templates')

    // Instructions for manual webhook configuration
    const setupInstructions = useSandbox 
      ? {
          step1: 'Join the Twilio Sandbox by sending "join <sandbox-keyword>" to whatsapp:+14155238886',
          step2: 'Configure sandbox webhooks in Twilio Console',
          inbound_url: inboundWebhookUrl,
          status_url: statusWebhookUrl,
        }
      : {
          step1: 'Go to Twilio Console > Messaging > Senders > WhatsApp Senders',
          step2: 'Select your WhatsApp number and configure the webhook URLs below',
          inbound_url: inboundWebhookUrl,
          status_url: statusWebhookUrl,
        }

    return new Response(
      JSON.stringify({ 
        success: true,
        whatsappFrom,
        templatesImported: syncedTemplates,
        setupInstructions,
        message: 'WhatsApp integration configured successfully'
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
