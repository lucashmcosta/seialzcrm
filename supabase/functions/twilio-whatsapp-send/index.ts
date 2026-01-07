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
    const { 
      organizationId, 
      contactId, 
      threadId,
      message, 
      templateId,
      templateVariables,
      mediaUrl,
      userId
    } = await req.json()

    if (!organizationId || !contactId) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: organizationId and contactId' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // Get WhatsApp integration config
    const { data: integration, error: integrationError } = await supabase
      .from('organization_integrations')
      .select(`
        config_values,
        admin_integrations!inner(slug)
      `)
      .eq('organization_id', organizationId)
      .eq('admin_integrations.slug', 'twilio-whatsapp')
      .eq('is_enabled', true)
      .single()

    if (integrationError || !integration) {
      console.error('WhatsApp integration not found:', integrationError)
      return new Response(
        JSON.stringify({ error: 'WhatsApp integration not configured or disabled' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const config = integration.config_values as any
    const accountSid = config.account_sid
    const authToken = config.auth_token
    const whatsappFrom = config.whatsapp_from

    if (!accountSid || !authToken || !whatsappFrom) {
      return new Response(
        JSON.stringify({ error: 'Invalid WhatsApp integration configuration' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get contact phone number
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .select('phone, full_name')
      .eq('id', contactId)
      .eq('organization_id', organizationId)
      .single()

    if (contactError || !contact?.phone) {
      return new Response(
        JSON.stringify({ error: 'Contact not found or has no phone number' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Format phone number
    let toPhone = contact.phone.replace(/[^\d+]/g, '')
    if (!toPhone.startsWith('+')) {
      if (toPhone.startsWith('55')) {
        toPhone = '+' + toPhone
      } else {
        toPhone = '+55' + toPhone
      }
    }
    const whatsappTo = `whatsapp:${toPhone}`

    // Check 24h window
    let isIn24hWindow = false
    let currentThreadId = threadId

    if (currentThreadId) {
      const { data: thread } = await supabase
        .from('message_threads')
        .select('whatsapp_last_inbound_at')
        .eq('id', currentThreadId)
        .single()

      if (thread?.whatsapp_last_inbound_at) {
        const lastInbound = new Date(thread.whatsapp_last_inbound_at)
        const now = new Date()
        const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60)
        isIn24hWindow = hoursDiff < 24
      }
    } else {
      // Find or create thread
      const { data: existingThread } = await supabase
        .from('message_threads')
        .select('id, whatsapp_last_inbound_at')
        .eq('organization_id', organizationId)
        .eq('contact_id', contactId)
        .eq('channel', 'whatsapp')
        .limit(1)
        .single()

      if (existingThread) {
        currentThreadId = existingThread.id
        
        if (existingThread.whatsapp_last_inbound_at) {
          const lastInbound = new Date(existingThread.whatsapp_last_inbound_at)
          const now = new Date()
          const hoursDiff = (now.getTime() - lastInbound.getTime()) / (1000 * 60 * 60)
          isIn24hWindow = hoursDiff < 24
        }
      } else {
        // Create new thread
        const { data: newThread, error: threadError } = await supabase
          .from('message_threads')
          .insert({
            organization_id: organizationId,
            contact_id: contactId,
            channel: 'whatsapp',
            subject: 'WhatsApp',
          })
          .select('id')
          .single()

        if (threadError) {
          console.error('Error creating thread:', threadError)
          return new Response(
            JSON.stringify({ error: 'Failed to create message thread' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        currentThreadId = newThread.id
      }
    }

    // If outside 24h window and no template, return error
    if (!isIn24hWindow && !templateId) {
      return new Response(
        JSON.stringify({ 
          error: 'Outside 24h window. Must use a template.',
          requiresTemplate: true,
          isIn24hWindow: false
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get template if using one
    let contentSid: string | null = null
    let messageBody = message

    if (templateId) {
      const { data: template, error: templateError } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('id', templateId)
        .eq('organization_id', organizationId)
        .eq('status', 'approved')
        .single()

      if (templateError || !template) {
        return new Response(
          JSON.stringify({ error: 'Template not found or not approved' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      contentSid = template.twilio_content_sid
      messageBody = template.body

      // Replace variables in body for display
      if (templateVariables && typeof templateVariables === 'object') {
        Object.entries(templateVariables).forEach(([key, value]) => {
          messageBody = messageBody.replace(`{{${key}}}`, value as string)
        })
      }
    }

    // Insert message record first (with status 'sending')
    const { data: insertedMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        organization_id: organizationId,
        thread_id: currentThreadId,
        content: messageBody,
        direction: 'outbound',
        sender_user_id: userId || null,
        whatsapp_status: 'sending',
        template_id: templateId || null,
        media_urls: mediaUrl ? [mediaUrl] : [],
        sent_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (insertError) {
      console.error('Error inserting message:', insertError)
      return new Response(
        JSON.stringify({ error: 'Failed to create message record' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Send via Twilio
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/status?orgId=${organizationId}`

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    
    const formData = new URLSearchParams()
    formData.append('From', whatsappFrom)
    formData.append('To', whatsappTo)
    formData.append('StatusCallback', statusCallbackUrl)

    if (contentSid) {
      formData.append('ContentSid', contentSid)
      if (templateVariables) {
        formData.append('ContentVariables', JSON.stringify(templateVariables))
      }
    } else {
      formData.append('Body', message)
    }

    if (mediaUrl) {
      formData.append('MediaUrl', mediaUrl)
    }

    console.log('Sending WhatsApp message:', {
      from: whatsappFrom,
      to: whatsappTo,
      contentSid,
      hasBody: !!message,
      hasMedia: !!mediaUrl
    })

    const twilioResponse = await fetch(twilioUrl, {
      method: 'POST',
      headers: {
        'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: formData.toString(),
    })

    const twilioData = await twilioResponse.json()

    if (!twilioResponse.ok) {
      console.error('Twilio error:', twilioData)
      
      // Update message with error
      await supabase
        .from('messages')
        .update({
          whatsapp_status: 'failed',
          error_code: twilioData.code?.toString(),
          error_message: twilioData.message,
        })
        .eq('id', insertedMessage.id)

      return new Response(
        JSON.stringify({ 
          error: 'Failed to send WhatsApp message',
          details: twilioData.message,
          code: twilioData.code
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update message with Twilio SID
    await supabase
      .from('messages')
      .update({
        whatsapp_message_sid: twilioData.sid,
        whatsapp_status: 'sent',
      })
      .eq('id', insertedMessage.id)

    // Update thread timestamp
    await supabase
      .from('message_threads')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', currentThreadId)

    // Create activity
    await supabase
      .from('activities')
      .insert({
        organization_id: organizationId,
        contact_id: contactId,
        activity_type: 'message',
        title: 'Mensagem WhatsApp enviada',
        body: messageBody.slice(0, 200),
        created_by_user_id: userId || null,
        occurred_at: new Date().toISOString(),
      })

    console.log('WhatsApp message sent successfully:', twilioData.sid)

    return new Response(
      JSON.stringify({ 
        success: true,
        messageSid: twilioData.sid,
        messageId: insertedMessage.id,
        threadId: currentThreadId,
        status: twilioData.status
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Send error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
