import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TwilioMessagingService {
  sid: string;
  friendly_name: string;
  inbound_request_url: string;
  status_callback: string;
}

interface TwilioWhatsAppSender {
  sid: string;
  phone_number: string;
  friendly_name: string;
  capabilities: {
    whatsapp: boolean;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const { organizationId, accountSid, authToken } = await req.json()

    if (!organizationId || !accountSid || !authToken) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: organizationId, accountSid, authToken' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Setting up WhatsApp for organization:', organizationId)

    const authHeader = 'Basic ' + btoa(`${accountSid}:${authToken}`)

    // Step 1: Validate Twilio credentials
    const accountUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`
    
    const accountResponse = await fetch(accountUrl, {
      headers: { 'Authorization': authHeader }
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
    
    // Webhook URLs for the Messaging Service
    const inboundWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/inbound?orgId=${organizationId}`
    const statusWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/status?orgId=${organizationId}`

    console.log('Webhook URLs:', { inboundWebhookUrl, statusWebhookUrl })

    // Step 2: Fetch available WhatsApp Senders
    let whatsappSenders: TwilioWhatsAppSender[] = []
    
    try {
      // Fetch all phone numbers from the account
      const phoneNumbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=100`
      
      const phoneNumbersResponse = await fetch(phoneNumbersUrl, {
        headers: { 'Authorization': authHeader }
      })

      if (phoneNumbersResponse.ok) {
        const phoneNumbersData = await phoneNumbersResponse.json()
        const phoneNumbers = phoneNumbersData.incoming_phone_numbers || []
        
        // Filter numbers that could be WhatsApp enabled
        whatsappSenders = phoneNumbers.map((pn: any) => ({
          sid: pn.sid,
          phone_number: pn.phone_number,
          friendly_name: pn.friendly_name || pn.phone_number,
          capabilities: {
            whatsapp: true // We'll assume all numbers could be WhatsApp enabled
          }
        }))
        
        console.log('Found', whatsappSenders.length, 'phone numbers')
      }
    } catch (e) {
      console.warn('Error fetching phone numbers:', e)
    }

    // Step 3: Check for existing Messaging Services or create one
    const serviceName = `CRM WhatsApp - ${organizationId.slice(0, 8)}`
    let messagingServiceSid: string | null = null
    let messagingServiceCreated = false

    try {
      // List existing Messaging Services
      const servicesUrl = 'https://messaging.twilio.com/v1/Services?PageSize=100'
      const servicesResponse = await fetch(servicesUrl, {
        headers: { 'Authorization': authHeader }
      })

      if (servicesResponse.ok) {
        const servicesData = await servicesResponse.json()
        const services = servicesData.services || []
        
        // Check if a service for this org already exists
        const existingService = services.find((s: TwilioMessagingService) => 
          s.friendly_name === serviceName
        )

        if (existingService) {
          messagingServiceSid = existingService.sid
          console.log('Found existing Messaging Service:', messagingServiceSid)

          // Update webhooks on existing service
          const updateServiceUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}`
          await fetch(updateServiceUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              InboundRequestUrl: inboundWebhookUrl,
              InboundMethod: 'POST',
              StatusCallback: statusWebhookUrl,
            }).toString()
          })
          console.log('Updated webhooks on existing Messaging Service')
        }
      }

      // Create new Messaging Service if not found
      if (!messagingServiceSid) {
        const createServiceUrl = 'https://messaging.twilio.com/v1/Services'
        const createResponse = await fetch(createServiceUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            FriendlyName: serviceName,
            InboundRequestUrl: inboundWebhookUrl,
            InboundMethod: 'POST',
            StatusCallback: statusWebhookUrl,
            UseInboundWebhookOnNumber: 'false', // Use service-level webhook
          }).toString()
        })

        if (createResponse.ok) {
          const newService = await createResponse.json()
          messagingServiceSid = newService.sid
          messagingServiceCreated = true
          console.log('Created new Messaging Service:', messagingServiceSid)
        } else {
          const errorText = await createResponse.text()
          console.warn('Could not create Messaging Service:', errorText)
        }
      }
    } catch (e) {
      console.warn('Error managing Messaging Service:', e)
    }

    // Step 4: Associate phone numbers with Messaging Service
    let associatedNumbers: string[] = []
    
    if (messagingServiceSid && whatsappSenders.length > 0) {
      for (const sender of whatsappSenders) {
        try {
          const associateUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers`
          const associateResponse = await fetch(associateUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
              PhoneNumberSid: sender.sid
            }).toString()
          })

          if (associateResponse.ok) {
            associatedNumbers.push(sender.phone_number)
            console.log('Associated number:', sender.phone_number)
          } else {
            // Number might already be associated
            const errorData = await associateResponse.json()
            if (errorData.code === 21710) { // Already associated
              associatedNumbers.push(sender.phone_number)
            }
          }
        } catch (e) {
          console.warn('Error associating number:', sender.phone_number, e)
        }
      }
    }

    // Step 5: Sync templates from Twilio Content API
    let templates: any[] = []
    
    try {
      const templatesUrl = 'https://content.twilio.com/v1/Content?PageSize=100'
      const templatesResponse = await fetch(templatesUrl, {
        headers: { 'Authorization': authHeader }
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

    // Step 6: Initialize Supabase and save configuration
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

    // Determine primary WhatsApp number
    const primaryNumber = whatsappSenders.length > 0 ? whatsappSenders[0].phone_number : null
    const whatsappFrom = messagingServiceSid 
      ? `whatsapp:${primaryNumber}` // Will use Messaging Service
      : (primaryNumber ? `whatsapp:${primaryNumber}` : null)

    // Upsert organization integration with full config
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
          messaging_service_sid: messagingServiceSid,
          whatsapp_number: primaryNumber,
          whatsapp_from: whatsappFrom,
          available_numbers: whatsappSenders.map(s => s.phone_number),
          use_sandbox: false,
          inbound_webhook_url: inboundWebhookUrl,
          status_webhook_url: statusWebhookUrl,
          webhooks_configured: !!messagingServiceSid,
          setup_completed_at: new Date().toISOString(),
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

    // Step 7: Sync templates to database
    let syncedTemplates = 0
    
    for (const template of templates) {
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
          status: 'approved',
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

    // Build success response
    const response = {
      success: true,
      messagingServiceSid,
      messagingServiceCreated,
      whatsappNumbers: whatsappSenders.map(s => ({
        phoneNumber: s.phone_number,
        friendlyName: s.friendly_name
      })),
      associatedNumbers,
      templatesImported: syncedTemplates,
      webhooksConfigured: !!messagingServiceSid,
      primaryNumber,
      message: messagingServiceSid 
        ? 'WhatsApp configurado automaticamente com sucesso!' 
        : 'WhatsApp configurado. Configure webhooks manualmente no Console do Twilio.',
      setupDetails: {
        inboundWebhookUrl,
        statusWebhookUrl,
      }
    }

    return new Response(
      JSON.stringify(response),
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
