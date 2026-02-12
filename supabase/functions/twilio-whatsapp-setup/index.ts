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

interface TwilioPhoneNumber {
  sid: string;
  phone_number: string;
  friendly_name: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    console.log('=== twilio-whatsapp-setup called ===');
    
    const body = await req.json()
    const { organizationId, accountSid, authToken, selectedNumber, mode } = body
    
    console.log('Request body received:', { 
      organizationId, 
      hasAccountSid: !!accountSid, 
      accountSidLength: accountSid?.length || 0,
      hasAuthToken: !!authToken,
      authTokenLength: authToken?.length || 0 
    });

    if (!organizationId || !accountSid || !authToken) {
      console.error('Missing required fields:', { 
        hasOrgId: !!organizationId, 
        hasAccountSid: !!accountSid, 
        hasAuthToken: !!authToken 
      });
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

    // Mode: list-numbers - return available numbers and existing WhatsApp senders without setup
    if (mode === 'list-numbers') {
      console.log('Mode: list-numbers - fetching available numbers and WhatsApp senders')

      // Fetch phone numbers
      let phoneNumbersList: { sid: string; phone_number: string; friendly_name: string }[] = []
      try {
        const phoneNumbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=100`
        const phoneNumbersResponse = await fetch(phoneNumbersUrl, {
          headers: { 'Authorization': authHeader }
        })
        if (phoneNumbersResponse.ok) {
          const data = await phoneNumbersResponse.json()
          phoneNumbersList = (data.incoming_phone_numbers || []).map((pn: any) => ({
            sid: pn.sid,
            phone_number: pn.phone_number,
            friendly_name: pn.friendly_name || pn.phone_number,
          }))
        }
      } catch (e) {
        console.warn('Error fetching phone numbers:', e)
      }

      // Fetch existing WhatsApp Senders from Messaging Services
      const whatsappSenders: string[] = []
      try {
        const servicesUrl = 'https://messaging.twilio.com/v1/Services?PageSize=100'
        const servicesResp = await fetch(servicesUrl, { headers: { 'Authorization': authHeader } })
        if (servicesResp.ok) {
          const servicesData = await servicesResp.json()
          for (const svc of (servicesData.services || [])) {
            const sendersUrl = `https://messaging.twilio.com/v1/Services/${svc.sid}/ChannelSenders?PageSize=100`
            const sendersResp = await fetch(sendersUrl, { headers: { 'Authorization': authHeader } })
            if (sendersResp.ok) {
              const sendersData = await sendersResp.json()
              for (const sender of (sendersData.senders || [])) {
                if (sender.sender?.startsWith('whatsapp:')) {
                  const number = sender.sender.replace('whatsapp:', '')
                  if (!whatsappSenders.includes(number)) {
                    whatsappSenders.push(number)
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        console.warn('Error fetching WhatsApp senders:', e)
      }

      console.log('list-numbers result:', { phoneNumbers: phoneNumbersList.length, whatsappSenders })

      return new Response(
        JSON.stringify({ success: true, phoneNumbers: phoneNumbersList, whatsappSenders }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    
    // Webhook URLs for the Messaging Service
    const inboundWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/inbound?orgId=${organizationId}`
    const statusWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/status?orgId=${organizationId}`

    console.log('Webhook URLs:', { inboundWebhookUrl, statusWebhookUrl })

    // Mode: check-webhooks - diagnose webhook configuration
    if (mode === 'check-webhooks') {
      console.log('Mode: check-webhooks - diagnosing webhook configuration')
      
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('config_values, admin_integrations!inner(slug)')
        .eq('organization_id', organizationId)
        .eq('admin_integrations.slug', 'twilio-whatsapp')
        .eq('is_enabled', true)
        .maybeSingle()
      
      const configValues = integration?.config_values as any
      const messagingServiceSid = configValues?.messaging_service_sid
      
      let serviceWebhooks: any = null
      let senders: string[] = []
      let numberWebhooks: any[] = []
      
      if (messagingServiceSid) {
        // Fetch current Messaging Service config
        const serviceResp = await fetch(
          `https://messaging.twilio.com/v1/Services/${messagingServiceSid}`,
          { headers: { 'Authorization': authHeader } }
        )
        if (serviceResp.ok) {
          const serviceData = await serviceResp.json()
          serviceWebhooks = {
            inbound_request_url: serviceData.inbound_request_url,
            status_callback: serviceData.status_callback,
            use_inbound_webhook_on_number: serviceData.use_inbound_webhook_on_number,
          }
        }
        
        // Fetch senders
        const sendersResp = await fetch(
          `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/ChannelSenders?PageSize=100`,
          { headers: { 'Authorization': authHeader } }
        )
        if (sendersResp.ok) {
          const sendersData = await sendersResp.json()
          senders = (sendersData.senders || []).map((s: any) => s.sender)
        }
      }
      
      // Check WhatsApp Sender webhook via v2 API
      let senderWebhook: any = null
      const primaryNumber = configValues?.whatsapp_number || configValues?.primary_number || configValues?.phone_number
      
      if (primaryNumber) {
        try {
          const cleanNumber = primaryNumber.replace('whatsapp:', '')
          const senderIdFormat = `whatsapp:${cleanNumber}`
          
          const sendersListUrl = `https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp`
          const sendersResp = await fetch(sendersListUrl, { headers: { 'Authorization': authHeader } })
          if (sendersResp.ok) {
            const sendersData = await sendersResp.json()
            const sender = sendersData.results?.find((s: any) => s.sender_id === senderIdFormat)
            if (sender) {
              senderWebhook = {
                sender_id: sender.sender_id,
                sid: sender.sid,
                webhook_url: sender.webhook_configuration?.url || null,
                status_callback_url: sender.webhook_configuration?.status_callback_url || null,
              }
            }
          }
        } catch (e) {
          console.warn('Error checking sender webhook:', e)
        }
      }
      
      const expectedInboundUrl = inboundWebhookUrl
      const isServiceConfigured = serviceWebhooks?.inbound_request_url === expectedInboundUrl
      const hasWhatsAppSenders = senders.some((s: string) => s.startsWith('whatsapp:'))
      const hasSenderWebhook = senderWebhook?.webhook_url === expectedInboundUrl
      
      return new Response(JSON.stringify({
        success: true,
        messaging_service_sid: messagingServiceSid,
        webhooks: serviceWebhooks,
        senders,
        sender_webhook: senderWebhook,
        expected_inbound_url: expectedInboundUrl,
        expected_status_url: statusWebhookUrl,
        is_inbound_configured: isServiceConfigured,
        has_whatsapp_senders: hasWhatsAppSenders,
        has_sender_webhook: hasSenderWebhook,
        diagnosis: !messagingServiceSid 
          ? 'Messaging Service não encontrado. Execute o setup novamente.'
          : hasSenderWebhook
          ? 'Configuração OK. Webhook configurado no WhatsApp Sender via API v2.'
          : !isServiceConfigured
          ? 'URL de webhook não configurada. Use "Corrigir Webhooks" para atualizar.'
          : 'Configuração OK via Messaging Service.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Mode: update-webhook - fix/update webhook URLs
    if (mode === 'update-webhook') {
      console.log('Mode: update-webhook - updating webhook URLs')
      
      const { webhookUrl } = body
      const supabase = createClient(supabaseUrl, serviceRoleKey)
      
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('id, config_values, admin_integrations!inner(slug)')
        .eq('organization_id', organizationId)
        .eq('admin_integrations.slug', 'twilio-whatsapp')
        .eq('is_enabled', true)
        .maybeSingle()
      
      if (!integration) {
        return new Response(JSON.stringify({ error: 'Integração WhatsApp não encontrada' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      
      const configValues = integration.config_values as any
      const messagingServiceSid = configValues?.messaging_service_sid
      const newInboundUrl = webhookUrl || inboundWebhookUrl
      
      if (!messagingServiceSid) {
        return new Response(JSON.stringify({ error: 'Messaging Service não configurado' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      }
      
      // Update Messaging Service webhooks
      const updateResp = await fetch(`https://messaging.twilio.com/v1/Services/${messagingServiceSid}`, {
        method: 'POST',
        headers: {
          'Authorization': authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          InboundRequestUrl: newInboundUrl,
          InboundMethod: 'POST',
          StatusCallback: statusWebhookUrl,
          UseInboundWebhookOnNumber: 'true',
        }).toString(),
      })
      
      const updateOk = updateResp.ok
      if (!updateOk) {
        const errText = await updateResp.text()
        console.error('Failed to update Messaging Service:', errText)
      }
      
      // Use Twilio Senders API v2 to configure webhook on WhatsApp Sender
      const primaryNumber = configValues?.whatsapp_number || configValues?.primary_number || configValues?.phone_number
      let senderAssociated = false
      
      console.log('[FIX-v2] Resolved primaryNumber:', primaryNumber)
      
      if (primaryNumber) {
        try {
          const cleanNumber = primaryNumber.replace('whatsapp:', '')
          const senderIdFormat = `whatsapp:${cleanNumber}`
          
          // Step 1: List WhatsApp Senders via v2 API
          const sendersListUrl = `https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp`
          const sendersResp = await fetch(sendersListUrl, {
            headers: { 'Authorization': authHeader }
          })
          const sendersData = await sendersResp.json()
          console.log('[FIX-v2] Senders list response:', sendersResp.status)
          console.log('[FIX-v2] Senders count:', sendersData.results?.length || 0)
          
          // Step 2: Find our sender
          const sender = sendersData.results?.find((s: any) => s.sender_id === senderIdFormat)
          console.log('[FIX-v2] Looking for sender_id:', senderIdFormat)
          console.log('[FIX-v2] Found sender:', sender ? sender.sid : 'NOT FOUND')
          
          if (sender) {
            // Step 3: Update webhook on the Sender resource
            const updateSenderUrl = `https://messaging.twilio.com/v2/Channels/Senders/${sender.sid}`
            const webhookConfig = {
              webhook_configuration: {
                url: newInboundUrl,
                method: 'POST',
                fallback_url: '',
                fallback_method: 'POST',
                status_callback_url: statusWebhookUrl,
                status_callback_method: 'POST',
              }
            }
            
            const updateSenderResp = await fetch(updateSenderUrl, {
              method: 'POST',
              headers: {
                'Authorization': authHeader,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify(webhookConfig),
            })
            
            const respText = await updateSenderResp.text()
            console.log('[FIX-v2] Update Sender webhook response:', updateSenderResp.status)
            console.log('[FIX-v2] Response body:', respText.substring(0, 500))
            
            if (updateSenderResp.ok) {
              senderAssociated = true
              console.log('[FIX-v2] ✅ Webhook configured on WhatsApp Sender:', senderIdFormat)
            } else {
              console.error('[FIX-v2] Failed to update Sender webhook:', respText)
            }
          } else {
            console.warn('[FIX-v2] Sender not found. Available senders:', JSON.stringify(sendersData.results?.map((s: any) => s.sender_id) || []))
          }
        } catch (e) {
          console.error('[FIX-v2] Error configuring Sender webhook:', e)
        }
      } else {
        console.warn('[FIX-v2] No primaryNumber found in config_values')
      }
      
      // Save to config_values
      await supabase
        .from('organization_integrations')
        .update({
          config_values: {
            ...configValues,
            inbound_webhook_url: newInboundUrl,
            status_webhook_url: statusWebhookUrl,
            webhooks_configured: updateOk,
            webhook_mode: webhookUrl ? 'custom' : 'edge-function',
            sender_associated: senderAssociated,
          }
        })
        .eq('id', integration.id)
      
      return new Response(JSON.stringify({
        success: updateOk,
        sender_associated: senderAssociated,
        inbound_webhook_url: newInboundUrl,
        message: updateOk 
          ? (senderAssociated ? 'Webhooks e Sender atualizados com sucesso!' : 'Webhooks atualizados, mas não foi possível associar o Sender.')
          : 'Falha ao atualizar webhooks no Twilio.',
      }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
    }

    // Step 2: Fetch available phone numbers from Twilio
    let phoneNumbers: TwilioPhoneNumber[] = []
    
    try {
      const phoneNumbersUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers.json?PageSize=100`
      
      const phoneNumbersResponse = await fetch(phoneNumbersUrl, {
        headers: { 'Authorization': authHeader }
      })

      if (phoneNumbersResponse.ok) {
        const phoneNumbersData = await phoneNumbersResponse.json()
        const numbers = phoneNumbersData.incoming_phone_numbers || []
        
        phoneNumbers = numbers.map((pn: any) => ({
          sid: pn.sid,
          phone_number: pn.phone_number,
          friendly_name: pn.friendly_name || pn.phone_number,
        }))
        
        console.log('Found', phoneNumbers.length, 'phone numbers:', phoneNumbers.map(p => p.phone_number))
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

          // Update webhooks on existing service - IMPORTANT: UseInboundWebhookOnNumber=true
          const updateServiceUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}`
          const updateBody = `InboundRequestUrl=${encodeURIComponent(inboundWebhookUrl)}&InboundMethod=POST&StatusCallback=${encodeURIComponent(statusWebhookUrl)}&UseInboundWebhookOnNumber=true`
          const updateResponse = await fetch(updateServiceUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: updateBody
          })
          
          if (updateResponse.ok) {
            const updateData = await updateResponse.json()
            console.log('Updated webhooks on Messaging Service:', {
              sid: updateData.sid,
              inbound_request_url: updateData.inbound_request_url,
              status_callback: updateData.status_callback,
              use_inbound_webhook_on_number: updateData.use_inbound_webhook_on_number
            })
          } else {
            const errorText = await updateResponse.text()
            console.error('Failed to update Messaging Service webhooks:', errorText)
          }
        }
      }

      // Create new Messaging Service if not found
      // IMPORTANT: UseInboundWebhookOnNumber=true ensures webhook is used on number level
      if (!messagingServiceSid) {
        const createServiceUrl = 'https://messaging.twilio.com/v1/Services'
        const createBody = `FriendlyName=${encodeURIComponent(serviceName)}&InboundRequestUrl=${encodeURIComponent(inboundWebhookUrl)}&InboundMethod=POST&StatusCallback=${encodeURIComponent(statusWebhookUrl)}&UseInboundWebhookOnNumber=true`
        const createResponse = await fetch(createServiceUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: createBody
        })

        if (createResponse.ok) {
          const newService = await createResponse.json()
          messagingServiceSid = newService.sid
          messagingServiceCreated = true
          console.log('Created new Messaging Service:', messagingServiceSid, 'with UseInboundWebhookOnNumber=true')
        } else {
          const errorText = await createResponse.text()
          console.warn('Could not create Messaging Service:', errorText)
        }
      }
    } catch (e) {
      console.warn('Error managing Messaging Service:', e)
    }

    // Step 4: Associate phone numbers with Messaging Service (as PhoneNumbers)
    let associatedNumbers: string[] = []
    
    if (messagingServiceSid && phoneNumbers.length > 0) {
      for (const number of phoneNumbers) {
        try {
          const associateUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/PhoneNumbers`
          const associateResponse = await fetch(associateUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `PhoneNumberSid=${number.sid}`
          })

          if (associateResponse.ok) {
            associatedNumbers.push(number.phone_number)
            console.log('Associated phone number to Messaging Service:', number.phone_number)
          } else {
            const errorData = await associateResponse.json()
            if (errorData.code === 21710) { // Already associated
              associatedNumbers.push(number.phone_number)
              console.log('Phone number already associated:', number.phone_number)
            } else {
              console.warn('Failed to associate number:', number.phone_number, errorData)
            }
          }
        } catch (e) {
          console.warn('Error associating number:', number.phone_number, e)
        }
      }
    }

    // Step 5: Configure webhook on WhatsApp Sender via Twilio v2 API
    let whatsappSendersAssociated: string[] = [...associatedNumbers]
    let numbersWithWebhook: string[] = []
    
    const whatsappNumberToAssociate = selectedNumber 
      || (phoneNumbers.length > 0 ? phoneNumbers[0].phone_number : null)
    
    if (whatsappNumberToAssociate) {
      const cleanNum = whatsappNumberToAssociate.replace('whatsapp:', '')
      const senderIdFormat = `whatsapp:${cleanNum}`
      
      try {
        // List WhatsApp Senders via v2 API
        const sendersListUrl = `https://messaging.twilio.com/v2/Channels/Senders?Channel=whatsapp`
        const sendersResp = await fetch(sendersListUrl, {
          headers: { 'Authorization': authHeader }
        })
        const sendersData = await sendersResp.json()
        console.log('[SETUP-v2] Senders list response:', sendersResp.status, 'count:', sendersData.results?.length || 0)
        
        const sender = sendersData.results?.find((s: any) => s.sender_id === senderIdFormat)
        console.log('[SETUP-v2] Looking for sender_id:', senderIdFormat, 'Found:', sender ? sender.sid : 'NOT FOUND')
        
        if (sender) {
          // Configure webhook on the Sender
          const updateSenderUrl = `https://messaging.twilio.com/v2/Channels/Senders/${sender.sid}`
          const webhookConfig = {
            webhook_configuration: {
              url: inboundWebhookUrl,
              method: 'POST',
              fallback_url: '',
              fallback_method: 'POST',
              status_callback_url: statusWebhookUrl,
              status_callback_method: 'POST',
            }
          }
          
          const updateSenderResp = await fetch(updateSenderUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(webhookConfig),
          })
          
          const respText = await updateSenderResp.text()
          console.log('[SETUP-v2] Update Sender webhook response:', updateSenderResp.status)
          console.log('[SETUP-v2] Response:', respText.substring(0, 500))
          
          if (updateSenderResp.ok) {
            if (!whatsappSendersAssociated.includes(cleanNum)) {
              whatsappSendersAssociated.push(cleanNum)
            }
            numbersWithWebhook.push(cleanNum)
            console.log('[SETUP-v2] ✅ Webhook configured on WhatsApp Sender:', senderIdFormat)
          } else {
            console.warn('[SETUP-v2] Failed to update Sender webhook:', respText)
          }
        } else {
          console.warn('[SETUP-v2] Sender not found. Available:', JSON.stringify(sendersData.results?.map((s: any) => s.sender_id) || []))
        }
      } catch (e) {
        console.warn('[SETUP-v2] Error configuring Sender webhook:', e)
      }
    }

    console.log('WhatsApp senders associated:', whatsappSendersAssociated)
    console.log('Numbers with webhook configured:', numbersWithWebhook)

    // Step 7: Sync templates from Twilio Content API
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

    // Step 8: Initialize Supabase and save configuration
    const supabase = createClient(
      supabaseUrl,
      serviceRoleKey
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

    // Determine primary WhatsApp number (use selectedNumber if provided)
    const primaryNumber = selectedNumber
      || (phoneNumbers.length > 0 ? phoneNumbers[0].phone_number : null)
    const whatsappFrom = primaryNumber ? `whatsapp:${primaryNumber}` : null

    // Upsert organization integration with full config
    console.log('Upserting organization integration...', {
      organizationId,
      integrationId: adminIntegration.id,
    })

    const { data: upsertData, error: upsertError } = await supabase
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
          available_numbers: phoneNumbers.map(n => n.phone_number),
          use_sandbox: false,
          inbound_webhook_url: inboundWebhookUrl,
          status_webhook_url: statusWebhookUrl,
          webhooks_configured: !!messagingServiceSid || numbersWithWebhook.length > 0,
          whatsapp_senders_associated: whatsappSendersAssociated,
          setup_completed_at: new Date().toISOString(),
        }
      }, {
        onConflict: 'organization_id,integration_id'
      })
      .select()
      .single()

    if (upsertError) {
      console.error('Error saving integration:', upsertError)
      return new Response(
        JSON.stringify({ error: 'Failed to save integration config', details: upsertError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('Integration saved successfully:', upsertData?.id)

    // Step 9: Sync templates to database
    let syncedTemplates = 0
    
    for (const template of templates) {
      const types = template.types || {}

      // Extract body, buttons, actions from correct type
      let extractedBody = ''
      let buttons: any[] = []
      let actions: any[] = []
      if (types['twilio/quick-reply']) {
        extractedBody = types['twilio/quick-reply'].body || ''
        buttons = (types['twilio/quick-reply'].actions || []).map((a: any) => ({ title: a.title, id: a.id }))
      } else if (types['twilio/call-to-action']) {
        extractedBody = types['twilio/call-to-action'].body || ''
        actions = (types['twilio/call-to-action'].actions || []).map((a: any) => ({
          type: a.type, title: a.title, url: a.url, phone: a.phone
        }))
      } else if (types['twilio/list-picker']) {
        extractedBody = types['twilio/list-picker'].body || ''
        actions = types['twilio/list-picker'].items || []
      } else if (types['twilio/card'] || types['whatsapp/card']) {
        const card = types['twilio/card'] || types['whatsapp/card']
        extractedBody = card.body || card.title || ''
        actions = card.actions || []
      } else if (types['whatsapp/authentication']) {
        extractedBody = types['whatsapp/authentication'].body || 'Authentication template'
      } else if (types['twilio/media']) {
        extractedBody = types['twilio/media'].body || ''
      } else if (types['twilio/text']) {
        extractedBody = types['twilio/text'].body || ''
      }

      // Fetch real approval status from Twilio
      let templateStatus = 'draft'
      let templateCategory = 'utility'
      let rejectionReason: string | null = null

      try {
        console.log(`[SETUP-SYNC] Template ${template.sid} (${template.friendly_name}) - Fetching approval...`)
        const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`
        const approvalResp = await fetch(approvalUrl, {
          headers: { 'Authorization': authHeader }
        })
        console.log(`[SETUP-SYNC] Template ${template.sid} - HTTP ${approvalResp.status}`)
        if (approvalResp.ok) {
          const approvalData = await approvalResp.json()
          console.log(`[SETUP-SYNC] Template ${template.sid} - Response:`, JSON.stringify(approvalData))
          console.log(`[SETUP-SYNC] Template ${template.sid} - approvalData.whatsapp:`, JSON.stringify(approvalData?.whatsapp))
          if (approvalData.whatsapp) {
            const statusMap: Record<string, string> = {
              'approved': 'approved', 'pending': 'pending', 'rejected': 'rejected',
              'paused': 'rejected', 'disabled': 'rejected', 'unsubmitted': 'draft',
              'received': 'pending', 'under_review': 'pending', 'in_review': 'pending', 'submitted': 'pending',
            }
            const whatsappStatus = approvalData.whatsapp.status
            const mappedStatus = statusMap[whatsappStatus]
            if (!mappedStatus) {
              console.warn(`[SETUP-SYNC] Unknown approval status: "${whatsappStatus}" for ${template.sid} - defaulting to draft`)
            }
            templateStatus = mappedStatus || 'draft'
            templateCategory = (approvalData.whatsapp.category || 'utility').toLowerCase()
            rejectionReason = approvalData.whatsapp.rejection_reason || null
          }
          console.log(`[SETUP-SYNC] Template ${template.sid} - Mapped: status=${templateStatus}, category=${templateCategory}`)
        } else {
          const errorText = await approvalResp.text()
          console.warn(`[SETUP-SYNC] Template ${template.sid} - Non-OK response:`, errorText)
        }
      } catch (e: any) {
        console.error(`[SETUP-SYNC] Template ${template.sid} - Error fetching approval:`, e?.message || e)
      }
      
      const { error: templateError } = await supabase
        .from('whatsapp_templates')
        .upsert({
          organization_id: organizationId,
          twilio_content_sid: template.sid,
          friendly_name: template.friendly_name || template.sid,
          language: template.language || 'pt_BR',
          template_type: (() => {
            const tk = Object.keys(template.types || {})
            const tm: Record<string, string> = {
              'twilio/text': 'text', 'twilio/quick-reply': 'quick-reply', 'twilio/list-picker': 'list-picker',
              'twilio/call-to-action': 'call-to-action', 'twilio/media': 'media', 'twilio/card': 'call-to-action',
              'whatsapp/authentication': 'text', 'whatsapp/card': 'call-to-action', 'whatsapp/list-picker': 'list-picker',
            }
            for (const k of tk) { if (tm[k]) return tm[k] }
            return 'text'
          })(),
          body: extractedBody,
          variables: template.variables || [],
          metadata: { buttons, actions },
          status: templateStatus,
          category: templateCategory,
          rejection_reason: rejectionReason,
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
      phoneNumbers: phoneNumbers.map(n => ({
        phoneNumber: n.phone_number,
        friendlyName: n.friendly_name
      })),
      associatedNumbers,
      whatsappSendersAssociated,
      numbersWithWebhook,
      templatesImported: syncedTemplates,
      webhooksConfigured: !!messagingServiceSid || numbersWithWebhook.length > 0,
      primaryNumber,
      message: whatsappSendersAssociated.length > 0
        ? `WhatsApp configurado com sucesso! ${whatsappSendersAssociated.length} sender(s) associado(s) ao Messaging Service.`
        : 'WhatsApp configurado. Configure webhooks manualmente no Console do Twilio se necessário.',
      setupDetails: {
        inboundWebhookUrl,
        statusWebhookUrl,
      }
    }

    console.log('=== Setup completed successfully ===', response)

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
