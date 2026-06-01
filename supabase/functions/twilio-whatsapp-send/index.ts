import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.json()
    const {
      organizationId,
      contactId,
      threadId,
      message,
      templateId,
      templateVariables,
      mediaUrl,
      mediaUrls,
      mediaType,
      userId,
      replyToMessageId,
      // New fields for agent identification
      isAgentMessage,
      agentId,
      senderName,
      // Phase 1.3A — Inbox dry-run only. Default behavior preserved bit-for-bit.
      senderContext,
      dryRun,
    } = body as Record<string, any>

    // ============================================================
    // Phase 1.3A — Dry-run branch (read-only, zero side effects)
    // - No Twilio call
    // - No INSERT into messages/activities
    // - No UPDATE on message_threads
    // - Only SELECTs to evaluate endpoint eligibility for /inbox
    //
    // NOTE on real `From` format (deferred to 1.3B):
    //   Today `whatsappFrom` is read from
    //   organization_integrations.config_values.whatsapp_from and used as-is.
    //   Whether Twilio accepts `whatsapp:<sender_sid>` (e.g. XE…/MG…) vs
    //   `whatsapp:+E164` in this account requires a separate audit before we
    //   switch to thread.primary_endpoint_id. In Phase 1.3A `resolved_from`
    //   is intentionally null — we only report what the endpoint carries.
    // ============================================================
    if (dryRun === true) {
      if (senderContext !== 'inbox') {
        return new Response(
          JSON.stringify({ error: 'dryRun is only supported with senderContext=inbox' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (!organizationId) {
        return new Response(
          JSON.stringify({ error: 'Missing required field: organizationId' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const supabaseDry = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      const NOTES =
        'resolved_from is intentionally null in Phase 1.3A. Real From format will be defined in 1.3B after Twilio format audit.'

      const baseEnvelope = (
        allowed: boolean,
        reason: string,
        extra: Record<string, any> = {},
      ) => ({
        dryRun: true,
        allowed,
        reason,
        warnings: [] as string[],
        thread_id: threadId ?? null,
        endpoint_id: null,
        resolved_sender_sid: null,
        resolved_external_address: null,
        resolved_from: null,
        current_global_whatsapp_from: null,
        in_24h_window: false,
        requires_template: true,
        notes: NOTES,
        ...extra,
      })

      // Load current global whatsapp_from for visibility (non-blocking).
      let currentGlobalWhatsappFrom: string | null = null
      try {
        const { data: integ } = await supabaseDry
          .from('organization_integrations')
          .select('config_values, admin_integrations!inner(slug), is_enabled')
          .eq('organization_id', organizationId)
          .eq('admin_integrations.slug', 'twilio-whatsapp')
          .eq('is_enabled', true)
          .maybeSingle()
        currentGlobalWhatsappFrom = (integ?.config_values as any)?.whatsapp_from ?? null
      } catch (e) {
        console.warn('[inbox-dryrun] could not read global whatsapp_from', String(e))
      }

      if (!threadId) {
        console.log('[inbox-dryrun] missing_thread', { organizationId })
        return new Response(
          JSON.stringify(baseEnvelope(false, 'missing_thread', {
            current_global_whatsapp_from: currentGlobalWhatsappFrom,
          })),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: thread, error: threadErr } = await supabaseDry
        .from('message_threads')
        .select('id, primary_endpoint_id, whatsapp_last_inbound_at, channel, organization_id')
        .eq('id', threadId)
        .eq('organization_id', organizationId)
        .maybeSingle()

      if (threadErr || !thread) {
        console.log('[inbox-dryrun] missing_thread (not found)', { threadId, err: threadErr?.message })
        return new Response(
          JSON.stringify(baseEnvelope(false, 'missing_thread', {
            current_global_whatsapp_from: currentGlobalWhatsappFrom,
          })),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const now = Date.now()
      const lastInboundMs = thread.whatsapp_last_inbound_at
        ? new Date(thread.whatsapp_last_inbound_at).getTime()
        : null
      const in24h = lastInboundMs ? (now - lastInboundMs) / 3_600_000 < 24 : false

      if (!thread.primary_endpoint_id) {
        console.log('[inbox-dryrun] no_endpoint', { threadId })
        return new Response(
          JSON.stringify(baseEnvelope(false, 'no_endpoint', {
            current_global_whatsapp_from: currentGlobalWhatsappFrom,
            in_24h_window: in24h,
            requires_template: !in24h,
          })),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const { data: endpoint, error: epErr } = await supabaseDry
        .from('communication_endpoints')
        .select('id, channel, purpose, provider, external_address, sender_sid, is_active, status, organization_integration_id')
        .eq('id', thread.primary_endpoint_id)
        .maybeSingle()

      if (epErr || !endpoint) {
        console.log('[inbox-dryrun] endpoint not found', { endpointId: thread.primary_endpoint_id })
        return new Response(
          JSON.stringify(baseEnvelope(false, 'no_endpoint', {
            current_global_whatsapp_from: currentGlobalWhatsappFrom,
            in_24h_window: in24h,
            requires_template: !in24h,
          })),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const warnings: string[] = []
      let allowed = true
      let reason = 'ok'

      if (endpoint.is_active === false) {
        allowed = false
        reason = 'endpoint_inactive'
      } else if (endpoint.channel !== 'whatsapp') {
        allowed = false
        reason = 'wrong_channel'
      } else if (endpoint.purpose === 'commercial' || endpoint.purpose === 'vendor_personal') {
        allowed = false
        reason = 'purpose_blocked'
      } else if (!endpoint.organization_integration_id) {
        allowed = false
        reason = 'integration_missing'
      } else if (!endpoint.sender_sid && !endpoint.external_address) {
        allowed = false
        reason = 'sender_data_missing'
      }

      if (allowed && endpoint.purpose === 'other') {
        warnings.push('endpoint_purpose_other')
      }

      const result = {
        dryRun: true,
        allowed,
        reason,
        warnings,
        thread_id: thread.id,
        endpoint_id: endpoint.id,
        resolved_sender_sid: endpoint.sender_sid ?? null,
        resolved_external_address: endpoint.external_address ?? null,
        resolved_from: null,
        current_global_whatsapp_from: currentGlobalWhatsappFrom,
        in_24h_window: in24h,
        requires_template: !in24h,
        notes: NOTES,
      }

      console.log('[inbox-dryrun] result', result)

      return new Response(
        JSON.stringify(result),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    // ============================================================
    // End Phase 1.3A dry-run branch. Default flow below is unchanged.
    // ============================================================

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

    // Collect all media URLs
    const allMediaUrls: string[] = []
    if (mediaUrl) {
      allMediaUrls.push(mediaUrl)
    }
    if (mediaUrls && Array.isArray(mediaUrls)) {
      allMediaUrls.push(...mediaUrls)
    }

    // Get sender name if userId provided and not already specified
    let resolvedSenderName = senderName || null
    if (!resolvedSenderName && userId && !isAgentMessage) {
      const { data: userData } = await supabase
        .from('users')
        .select('full_name')
        .eq('id', userId)
        .single()
      resolvedSenderName = userData?.full_name || null
    }

    // ============================================================
    // Resolve endpoint_id from `whatsappFrom`
    // Best-effort: NULL is OK, will not break insert.
    // ============================================================
    const fromAddress = whatsappFrom.replace(/^whatsapp:/, '')
    let endpointId: string | null = null
    try {
      const { data: epData, error: epErr } = await supabase
        .rpc('resolve_communication_endpoint', {
          _organization_id: organizationId,
          _channel: 'whatsapp',
          _address: fromAddress,
        })
      if (epErr) {
        console.warn('[endpoint-resolve] rpc error', JSON.stringify({
          org_id: organizationId, from: fromAddress, to: whatsappTo, err: epErr.message,
        }))
      } else if (epData) {
        endpointId = epData as unknown as string
      } else {
        console.warn('[endpoint-resolve] no match', JSON.stringify({
          org_id: organizationId, from: fromAddress, to: whatsappTo,
        }))
      }
    } catch (e) {
      console.warn('[endpoint-resolve] exception', JSON.stringify({
        org_id: organizationId, from: fromAddress, to: whatsappTo, err: String(e),
      }))
    }

    // Build initial twilio metadata snapshot
    const twilioMetadata: Record<string, any> = {
      From: whatsappFrom,
      To: whatsappTo,
      AccountSid: accountSid,
      ContentSid: contentSid || null,
    }
    if (allMediaUrls.length > 0) {
      twilioMetadata.MediaUrls = allMediaUrls
    }

    // Insert message record first (with status 'sending')
    const { data: insertedMessage, error: insertError } = await supabase
      .from('messages')
      .insert({
        organization_id: organizationId,
        thread_id: currentThreadId,
        content: messageBody || '',
        direction: 'outbound',
        sender_user_id: userId || null,
        whatsapp_status: 'sending',
        template_id: templateId || null,
        media_urls: allMediaUrls.length > 0 ? allMediaUrls : [],
        media_type: mediaType || null,
        sent_at: new Date().toISOString(),
        reply_to_message_id: replyToMessageId || null,
        // New sender identification fields
        sender_type: isAgentMessage ? 'agent' : 'user',
        sender_name: resolvedSenderName,
        sender_agent_id: isAgentMessage && agentId ? agentId : null,
        endpoint_id: endpointId,
        metadata: { twilio: twilioMetadata },
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

    // Backfill primary_endpoint_id on thread if missing (best-effort, non-blocking)
    if (endpointId && currentThreadId) {
      supabase
        .from('message_threads')
        .update({ primary_endpoint_id: endpointId })
        .eq('id', currentThreadId)
        .is('primary_endpoint_id', null)
        .then(({ error }) => {
          if (error) console.warn('[thread-endpoint-backfill] failed', error.message)
        })
    }

    // Send via Twilio
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
    const statusCallbackUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-webhook/status?orgId=${organizationId}`

    const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`
    
    const formData = new URLSearchParams()
    formData.append('From', whatsappFrom)
    formData.append('To', whatsappTo)
    formData.append('StatusCallback', statusCallbackUrl)

    // Handle reply context - get the original message's Twilio SID
    if (replyToMessageId) {
      const { data: originalMessage, error: replyError } = await supabase
        .from('messages')
        .select('whatsapp_message_sid')
        .eq('id', replyToMessageId)
        .single()

      if (originalMessage?.whatsapp_message_sid) {
        console.log('Adding reply context - RepliedMessageSid:', originalMessage.whatsapp_message_sid)
        formData.append('RepliedMessageSid', originalMessage.whatsapp_message_sid)
      } else {
        console.log('Could not resolve reply context:', replyError?.message || 'No SID found')
      }
    }

    if (contentSid) {
      formData.append('ContentSid', contentSid)
      if (templateVariables) {
        formData.append('ContentVariables', JSON.stringify(templateVariables))
      }
    } else if (messageBody) {
      // Filter out media placeholder texts that shouldn't be sent
      const mediaPlaceholders = ['📎 Mídia', '📷 Imagem', '🎵 Áudio', '🎬 Vídeo', '📎 Media', '📷 Image', '🎵 Audio', '🎬 Video']
      if (!mediaPlaceholders.includes(messageBody)) {
        formData.append('Body', messageBody)
      }
    }

    // Add media URLs (Twilio accepts multiple MediaUrl params)
    allMediaUrls.forEach((url) => {
      formData.append('MediaUrl', url)
    })

    console.log('Sending WhatsApp message:', {
      from: whatsappFrom,
      to: whatsappTo,
      contentSid,
      hasBody: !!messageBody,
      mediaCount: allMediaUrls.length,
      mediaType
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

    // Update message with Twilio SID + enrich metadata
    const enrichedMetadata = {
      twilio: {
        ...twilioMetadata,
        MessageSid: twilioData.sid,
      },
    }
    await supabase
      .from('messages')
      .update({
        whatsapp_message_sid: twilioData.sid,
        whatsapp_status: 'sent',
        metadata: enrichedMetadata,
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
        title: allMediaUrls.length > 0 
          ? `Mensagem WhatsApp enviada (${mediaType || 'mídia'})`
          : 'Mensagem WhatsApp enviada',
        body: messageBody?.slice(0, 200) || '',
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
