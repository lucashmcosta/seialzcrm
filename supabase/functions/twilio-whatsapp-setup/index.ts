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
            const sendersUrl = `https://messaging.twilio.com/v1/Services/${svc.sid}/Senders?PageSize=100`
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
    
    // Webhook URLs for the Messaging Service
    const inboundWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/inbound?orgId=${organizationId}`
    const statusWebhookUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/status?orgId=${organizationId}`

    console.log('Webhook URLs:', { inboundWebhookUrl, statusWebhookUrl })

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

    // Step 5: Associate WhatsApp Senders to Messaging Service
    // This is the KEY step that was missing - WhatsApp uses Senders API, not just PhoneNumbers
    let whatsappSendersAssociated: string[] = []
    
    if (messagingServiceSid && phoneNumbers.length > 0) {
      for (const number of phoneNumbers) {
        try {
          // Add as WhatsApp Sender to the Messaging Service
          const senderUrl = `https://messaging.twilio.com/v1/Services/${messagingServiceSid}/Senders`
          const whatsappSenderId = `whatsapp:${number.phone_number}`
          
          const senderResponse = await fetch(senderUrl, {
            method: 'POST',
            headers: {
              'Authorization': authHeader,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: `Sender=${encodeURIComponent(whatsappSenderId)}`
          })

          if (senderResponse.ok) {
            whatsappSendersAssociated.push(number.phone_number)
            console.log('✅ Associated WhatsApp Sender to Messaging Service:', whatsappSenderId)
          } else {
            const errorText = await senderResponse.text()
            // Check if already associated (code 21714 or similar)
            if (errorText.includes('21714') || errorText.includes('already exists')) {
              whatsappSendersAssociated.push(number.phone_number)
              console.log('WhatsApp Sender already associated:', whatsappSenderId)
            } else {
              console.warn('Could not associate WhatsApp Sender:', whatsappSenderId, errorText)
            }
          }
        } catch (e) {
          console.warn('Error associating WhatsApp Sender:', number.phone_number, e)
        }
      }
    }

    console.log('WhatsApp Senders associated:', whatsappSendersAssociated)

    // Step 6: Configure webhooks directly on phone numbers (as fallback)
    // This ensures webhooks work for WhatsApp even if Messaging Service isn't triggered
    let numbersWithWebhook: string[] = []
    
    for (const number of phoneNumbers) {
      try {
        const updateNumberUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/IncomingPhoneNumbers/${number.sid}.json`
        
        // Configure both SMS and Voice webhooks (WhatsApp uses SMS endpoints)
        const numberUpdateResponse = await fetch(updateNumberUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeader,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: `SmsUrl=${encodeURIComponent(inboundWebhookUrl)}&SmsMethod=POST&StatusCallback=${encodeURIComponent(statusWebhookUrl)}&StatusCallbackMethod=POST`
        })

        if (numberUpdateResponse.ok) {
          numbersWithWebhook.push(number.phone_number)
          console.log('Configured webhook directly on number:', number.phone_number)
        } else {
          const errorText = await numberUpdateResponse.text()
          console.warn('Could not update webhook on number:', number.phone_number, errorText)
        }
      } catch (e) {
        console.warn('Error updating number webhook:', number.phone_number, e)
      }
    }
    
    console.log('Numbers with direct webhook configured:', numbersWithWebhook)

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
      const whatsappType = types['twilio/whatsapp'] || types['twilio/text'] || {}

      // Fetch real approval status from Twilio
      let templateStatus = 'draft'
      let templateCategory = 'utility'
      let rejectionReason: string | null = null

      try {
        const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`
        const approvalResp = await fetch(approvalUrl, {
          headers: { 'Authorization': authHeader }
        })
        if (approvalResp.ok) {
          const approvalData = await approvalResp.json()
          if (approvalData.whatsapp) {
            const statusMap: Record<string, string> = {
              'approved': 'approved', 'pending': 'pending', 'rejected': 'rejected',
              'paused': 'rejected', 'disabled': 'rejected', 'unsubmitted': 'draft',
            }
            templateStatus = statusMap[approvalData.whatsapp.status] || 'draft'
            templateCategory = (approvalData.whatsapp.category || 'utility').toLowerCase()
            rejectionReason = approvalData.whatsapp.rejection_reason || null
          }
        }
      } catch (e) {
        console.warn('Error fetching approval for', template.sid, e)
      }
      
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
