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
    // Phase 1.3D: contactId may be reassigned in inbox path from thread.contact_id
    let {
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
      // Optional explicit endpoint selection from /messages composer.
      // When provided (and senderContext !== 'inbox'), the function uses this
      // endpoint's external_address as `From` and stamps messages.endpoint_id
      // with it. Does NOT alter message_threads.primary_endpoint_id.
      endpointId: messagesEndpointIdInput,
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
    // End Phase 1.3A dry-run branch.
    // ============================================================

    // ============================================================
    // Phase 1.3B — Inbox real-send guards (senderContext='inbox', dryRun!=true)
    //
    // When invoked from /inbox we:
    //   - REQUIRE threadId
    //   - resolve endpoint via thread.primary_endpoint_id (never RPC)
    //   - accept ONLY purpose='customer_service'
    //   - block commercial, vendor_personal, other (no feature flag)
    //   - build From as `whatsapp:${endpoint.external_address}` (E.164)
    //   - never use sender_sid as From
    //
    // The default ('messages') path below is unchanged byte-for-byte.
    // ============================================================
    let inboxWhatsappFromOverride: string | null = null
    let inboxEndpointIdOverride: string | null = null

    if (senderContext === 'inbox') {
      const inboxErr = (status: number, reason: string, extra: Record<string, any> = {}) => {
        console.log('[inbox-send] blocked', { reason, threadId, ...extra })
        return new Response(
          JSON.stringify({ error: reason, senderContext: 'inbox', thread_id: threadId ?? null, ...extra }),
          { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      if (!organizationId) return inboxErr(400, 'missing_organization')
      if (!threadId) return inboxErr(400, 'missing_thread')

      // Twilio WhatsApp Body limit is 1600 characters. Reject early with a clear reason.
      if (!templateId && typeof message === 'string' && message.length > 1600) {
        return inboxErr(400, 'message_too_long', { length: message.length, max: 1600 })
      }

      const supabaseInbox = createClient(
        Deno.env.get('SUPABASE_URL') ?? '',
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
      )

      // Phase 1.3D: load thread including status + contact_id
      const { data: thread, error: tErr } = await supabaseInbox
        .from('message_threads')
        .select('id, primary_endpoint_id, organization_id, channel, status, contact_id')
        .eq('id', threadId)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (tErr || !thread) return inboxErr(404, 'thread_not_found')
      if (thread.status === 'resolved' || thread.status === 'closed') {
        return inboxErr(409, 'thread_closed', { status: thread.status })
      }
      if (!thread.contact_id) return inboxErr(400, 'thread_without_contact')

      // Resolve primary_endpoint_id with fallbacks for legacy threads
      let resolvedEndpointId: string | null = thread.primary_endpoint_id ?? null

      if (!resolvedEndpointId) {
        // Fallback 1: most recent message in this thread that has endpoint_id
        const { data: lastMsg } = await supabaseInbox
          .from('messages')
          .select('endpoint_id')
          .eq('thread_id', thread.id)
          .not('endpoint_id', 'is', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
        if (lastMsg?.endpoint_id) {
          resolvedEndpointId = lastMsg.endpoint_id as string
          console.log('[inbox-send] endpoint_resolved_via_last_message', { threadId, endpointId: resolvedEndpointId })
        }
      }

      if (!resolvedEndpointId) {
        // Fallback 2: pick best eligible WhatsApp endpoint in the organization.
        // CROSS-ORG GUARD: filter by the org's configured whatsapp_number to prevent
        // sending through another org's Twilio endpoint when Twilio account is shared.
        let orgWhatsappNumber: string | null = null
        try {
          const { data: orgInteg } = await supabaseInbox
            .from('organization_integrations')
            .select('config_values, admin_integrations!inner(slug)')
            .eq('organization_id', organizationId)
            .eq('admin_integrations.slug', 'twilio-whatsapp')
            .eq('is_enabled', true)
            .maybeSingle()
          const raw = (orgInteg?.config_values as any)?.whatsapp_number ?? null
          if (raw && typeof raw === 'string') {
            orgWhatsappNumber = raw.replace(/^whatsapp:/i, '').trim()
          }
        } catch (e) {
          console.warn('[inbox-send] failed to load org whatsapp_number', (e as Error).message)
        }
        console.log('[inbox-send] org_whatsapp_number', { organizationId, orgWhatsappNumber })

        let query = supabaseInbox
          .from('communication_endpoints')
          .select('id, status, sender_sid, purpose, created_at, external_address')
          .eq('organization_id', organizationId)
          .eq('channel', 'whatsapp')
          .eq('is_active', true)
          .in('purpose', ['customer_service', 'other'])

        const { data: rawCandidates } = await query

        // If org has whatsapp_number configured, STRICTLY filter by it (block cross-org leak).
        // Otherwise, fall back to old behavior to avoid breaking orgs without setup.
        let candidates = rawCandidates ?? []
        if (orgWhatsappNumber) {
          const normalize = (v: string | null | undefined) =>
            (v ?? '').replace(/^whatsapp:/i, '').replace(/\s+/g, '').trim()
          const target = normalize(orgWhatsappNumber)
          candidates = candidates.filter((c: any) => normalize(c.external_address) === target)
          if (candidates.length === 0) {
            console.error('[inbox-send] cross_org_leak_blocked', {
              organizationId,
              orgWhatsappNumber,
              available_endpoints: (rawCandidates ?? []).map((c: any) => ({
                id: c.id,
                external_address: c.external_address,
              })),
            })
            return inboxErr(400, 'no_endpoint_for_org_number', {
              organization_id: organizationId,
              configured_number: orgWhatsappNumber,
              available_count: rawCandidates?.length ?? 0,
            })
          }
        } else {
          console.warn('[inbox-send] org_has_no_whatsapp_number_configured_using_legacy_fallback', { organizationId })
        }

        const ranked = candidates.slice().sort((a: any, b: any) => {
          const aOnline = a.status === 'online' ? 0 : 1
          const bOnline = b.status === 'online' ? 0 : 1
          if (aOnline !== bOnline) return aOnline - bOnline
          const aSid = a.sender_sid ? 0 : 1
          const bSid = b.sender_sid ? 0 : 1
          if (aSid !== bSid) return aSid - bSid
          const aCs = a.purpose === 'customer_service' ? 0 : 1
          const bCs = b.purpose === 'customer_service' ? 0 : 1
          if (aCs !== bCs) return aCs - bCs
          return String(a.created_at ?? '').localeCompare(String(b.created_at ?? ''))
        })

        const best = ranked[0]
        if (best && (best.status === 'online' || ranked.length === 1)) {
          resolvedEndpointId = best.id as string
          console.log('[inbox-send] endpoint_resolved_via_ranked_fallback', {
            threadId,
            endpointId: resolvedEndpointId,
            status: best.status,
            sender_sid: best.sender_sid,
            external_address: best.external_address,
            total_candidates: ranked.length,
            filtered_by_org_number: !!orgWhatsappNumber,
          })
        } else {
          return inboxErr(400, 'no_endpoint', {
            organization_id: organizationId,
            candidates_count: candidates.length,
          })
        }
      }

      // Best-effort backfill so future sends skip the fallback
      if (resolvedEndpointId && !thread.primary_endpoint_id) {
        supabaseInbox
          .from('message_threads')
          .update({ primary_endpoint_id: resolvedEndpointId })
          .eq('id', thread.id)
          .is('primary_endpoint_id', null)
          .then(({ error }) => {
            if (error) console.warn('[inbox-send] backfill primary_endpoint_id failed', error.message)
          })
      }

      // Phase 1.3D: validate contact lifecycle = customer (ignore payload contactId)
      const { data: ct, error: ctErr } = await supabaseInbox
        .from('contacts')
        .select('id, lifecycle_stage, organization_id')
        .eq('id', thread.contact_id)
        .eq('organization_id', organizationId)
        .maybeSingle()
      if (ctErr || !ct) return inboxErr(404, 'contact_not_found')
      if (ct.lifecycle_stage !== 'customer') {
        return inboxErr(403, 'not_customer', { lifecycle_stage: ct.lifecycle_stage })
      }

      // Override payload contactId with the thread's authoritative contact
      contactId = thread.contact_id

      const { data: ep, error: eErr } = await supabaseInbox
        .from('communication_endpoints')
        .select('id, channel, purpose, external_address, is_active, organization_integration_id')
        .eq('id', resolvedEndpointId)
        .maybeSingle()
      if (eErr || !ep) return inboxErr(400, 'no_endpoint')

      if (ep.is_active === false) return inboxErr(400, 'endpoint_inactive')
      if (ep.channel !== 'whatsapp') return inboxErr(400, 'wrong_channel')
      // Phase 1.3D: allow customer_service AND other; block only commercial/vendor_personal.
      if (ep.purpose === 'commercial' || ep.purpose === 'vendor_personal') {
        return inboxErr(403, 'purpose_blocked', { endpoint_purpose: ep.purpose })
      }
      if (ep.purpose !== 'customer_service' && ep.purpose !== 'other') {
        return inboxErr(403, 'purpose_blocked', { endpoint_purpose: ep.purpose })
      }
      if (ep.purpose === 'other') {
        console.warn('[inbox-send] endpoint_purpose_other', {
          threadId,
          endpoint_id: ep.id,
          organization_id: organizationId,
        })
      }
      if (!ep.organization_integration_id) return inboxErr(400, 'integration_missing')
      if (!ep.external_address || !/^\+\d{8,15}$/.test(ep.external_address)) {
        return inboxErr(400, 'sender_data_missing')
      }

      inboxWhatsappFromOverride = `whatsapp:${ep.external_address}`
      inboxEndpointIdOverride = ep.id
      console.log('[inbox-send] guards ok', {
        threadId,
        contact_id: thread.contact_id,
        endpoint_id: ep.id,
        endpoint_purpose: ep.purpose,
        from: inboxWhatsappFromOverride,
      })
    }
    // ============================================================
    // End Phase 1.3B inbox guards. Default flow below is unchanged.
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

    // ============================================================
    // /messages path — optional explicit endpoint override
    // Used during the temporary period where an org operates more than one
    // WhatsApp number on /messages. Validates strict ownership and channel.
    // Does NOT mutate message_threads.primary_endpoint_id.
    // ============================================================
    let messagesFromOverride: string | null = null
    let messagesEndpointIdOverride: string | null = null
    let manualEndpointOverride = false
    if (
      senderContext !== 'inbox' &&
      typeof messagesEndpointIdInput === 'string' &&
      messagesEndpointIdInput.length > 0 &&
      organizationId
    ) {
      const { data: ep, error: epErr } = await supabase
        .from('communication_endpoints')
        .select('id, external_address, channel, is_active, organization_id')
        .eq('id', messagesEndpointIdInput)
        .maybeSingle()
      if (epErr || !ep) {
        console.warn('[messages-endpoint-override] endpoint not found', { messagesEndpointIdInput, err: epErr?.message })
        return new Response(
          JSON.stringify({ error: 'Invalid endpointId' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      if (
        ep.organization_id !== organizationId ||
        ep.channel !== 'whatsapp' ||
        !ep.is_active ||
        !ep.external_address
      ) {
        console.warn('[messages-endpoint-override] endpoint rejected', {
          messagesEndpointIdInput,
          organizationId,
          ep_org: ep.organization_id,
          channel: ep.channel,
          is_active: ep.is_active,
        })
        return new Response(
          JSON.stringify({ error: 'Endpoint not allowed for this organization/channel' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      messagesFromOverride = `whatsapp:${ep.external_address}`
      messagesEndpointIdOverride = ep.id
      manualEndpointOverride = true
      console.log('[messages-endpoint-override] applied', {
        organizationId,
        endpoint_id: ep.id,
        from: messagesFromOverride,
      })
    }

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
    // Phase 1.3B: in inbox path, override `From` with endpoint.external_address (E.164).
    // /messages: when caller passed a valid `endpointId`, use that endpoint's
    // address; otherwise fall back to config.whatsapp_from (legacy behavior).
    const whatsappFrom = inboxWhatsappFromOverride ?? messagesFromOverride ?? config.whatsapp_from

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
    // Phase 1.3B: in inbox path, endpoint already resolved via thread —
    // skip the RPC to avoid resolving by global whatsapp_from when both
    // would otherwise tie. /messages path keeps existing RPC resolution.
    // ============================================================
    const fromAddress = whatsappFrom.replace(/^whatsapp:/, '')
    let endpointId: string | null = inboxEndpointIdOverride ?? messagesEndpointIdOverride
    if (!endpointId) {
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

    // Backfill primary_endpoint_id on thread if missing (best-effort, non-blocking).
    // SKIP when the caller explicitly chose an endpoint from the /messages
    // composer — that selection is per-send, not a thread-level decision.
    if (endpointId && currentThreadId && !manualEndpointOverride) {
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
