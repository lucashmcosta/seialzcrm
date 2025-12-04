import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Formata número para E.164 (padrão internacional do Twilio)
 * Entrada: 11964298621 → Saída: +5511964298621
 */
function formatToE164(phone: string): string {
  const cleaned = phone.replace(/[^\d+]/g, '')
  
  if (cleaned.startsWith('+')) {
    return cleaned
  }
  
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    return '+' + cleaned
  }
  
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    return '+55' + cleaned
  }
  
  return '+55' + cleaned
}

/**
 * Normaliza número de telefone para múltiplas variações de busca
 * Isso permite encontrar contatos independente de como o número foi salvo
 */
function normalizePhoneForSearch(phone: string): string[] {
  const cleaned = phone.replace(/[^\d]/g, '')
  
  const variations = new Set<string>()
  
  // Original
  variations.add(phone)
  
  // Apenas dígitos
  variations.add(cleaned)
  
  // Com +
  variations.add('+' + cleaned)
  
  // Sem código do país (55)
  if (cleaned.startsWith('55') && cleaned.length >= 12) {
    const withoutCountry = cleaned.slice(2)
    variations.add(withoutCountry)
    variations.add('+55' + withoutCountry)
  }
  
  // Com código do país
  if (!cleaned.startsWith('55') && cleaned.length >= 10 && cleaned.length <= 11) {
    variations.add('55' + cleaned)
    variations.add('+55' + cleaned)
  }
  
  return Array.from(variations)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const formData = await req.formData()
    const params: Record<string, string> = {}
    formData.forEach((value, key) => {
      params[key] = value.toString()
    })

    const orgId = url.searchParams.get('orgId')

    console.log(`Webhook ${path}:`, JSON.stringify(params, null, 2))

    // ========== ROUTE: /voice (Browser WebRTC calls & Inbound calls) ==========
    if (path === 'voice') {
      const to = params.To || url.searchParams.get('to')
      const from = params.From || params.Caller
      const direction = params.Direction
      const calledNumber = params.Called || params.To
      
      console.log('Voice request - To:', to, 'From:', from, 'Direction:', direction, 'OrgId:', orgId, 'Called:', calledNumber)

      // ========== INBOUND CALL DETECTION ==========
      const isInboundCall = direction === 'inbound' && from && !from.startsWith('client:')
      
      if (isInboundCall) {
        console.log('Inbound call detected from:', from, 'to:', calledNumber)
        
        // Get phone number configuration from organization_phone_numbers
        let phoneConfig = null
        
        if (orgId) {
          const { data } = await supabase
            .from('organization_phone_numbers')
            .select('*')
            .eq('organization_id', orgId)
            .eq('is_primary', true)
            .single()
          
          phoneConfig = data
        }
        
        // If no orgId, try to find by called number
        if (!phoneConfig && calledNumber) {
          const formattedCalled = formatToE164(calledNumber)
          const { data } = await supabase
            .from('organization_phone_numbers')
            .select('*')
            .or(`phone_number.eq.${formattedCalled},phone_number.eq.${calledNumber}`)
            .single()
          
          phoneConfig = data
        }
        
        console.log('Phone config found:', phoneConfig)
        
        // If no config or no users configured, check ring_strategy
        if (!phoneConfig || !phoneConfig.ring_users || phoneConfig.ring_users.length === 0) {
          if (phoneConfig?.ring_strategy === 'all') {
            // Get all active users from the organization
            const { data: orgUsers } = await supabase
              .from('user_organizations')
              .select('user_id')
              .eq('organization_id', phoneConfig.organization_id)
              .eq('is_active', true)
            
            if (orgUsers && orgUsers.length > 0) {
              phoneConfig.ring_users = orgUsers.map(u => u.user_id)
              console.log('Ring all users:', phoneConfig.ring_users)
            }
          }
        }
        
        // If still no users to ring, play message
        if (!phoneConfig?.ring_users || phoneConfig.ring_users.length === 0) {
          console.log('No users configured to receive calls, playing message')
          const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR" voice="alice">Olá! Obrigado por ligar. No momento não podemos atender sua chamada. Por favor, tente novamente mais tarde ou entre em contato por outros canais. Até breve!</Say>
</Response>`
          
          return new Response(twiml, {
            headers: { 'Content-Type': 'text/xml' }
          })
        }
        
        // Build TwiML to ring users' browsers via WebRTC
        const timeout = phoneConfig.ring_timeout_seconds || 30
        const statusCallbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-webhook/status?orgId=${phoneConfig.organization_id}`
        
        // Create <Client> elements for each user - USE user- PREFIX to match identity!
        const clientElements = phoneConfig.ring_users
          .map((userId: string) => `    <Client>user-${userId}</Client>`)
          .join('\n')
        
        const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial timeout="${timeout}" action="${statusCallbackUrl}" callerId="${from}">
${clientElements}
  </Dial>
  <Say language="pt-BR" voice="alice">Desculpe, não foi possível conectar sua chamada. Por favor, tente novamente mais tarde.</Say>
</Response>`
        
        console.log('Returning inbound TwiML with clients:', twiml)
        
        // Try to find contact by phone number with normalization
        let contactId: string | null = null
        let contactName: string | null = null
        
        const phoneVariations = normalizePhoneForSearch(from)
        console.log('Searching contact with phone variations:', phoneVariations)
        
        const orConditions = phoneVariations.map(p => `phone.eq.${p}`).join(',')
        const { data: contact } = await supabase
          .from('contacts')
          .select('id, full_name')
          .eq('organization_id', phoneConfig.organization_id)
          .or(orConditions)
          .is('deleted_at', null)
          .limit(1)
          .single()
        
        if (contact) {
          contactId = contact.id
          contactName = contact.full_name
          console.log('Found contact:', contactId, contactName)
        } else {
          console.log('No contact found for phone:', from)
          
          // Check if auto_create_contact is enabled
          const inboundSettings = phoneConfig.inbound_settings || { auto_create_contact: true, default_lifecycle_stage: 'lead' }
          
          if (inboundSettings.auto_create_contact) {
            // Auto-create contact
            const { data: newContact, error: createError } = await supabase
              .from('contacts')
              .insert({
                organization_id: phoneConfig.organization_id,
                full_name: `Novo contato ${from}`,
                phone: from,
                source: 'inbound_call',
                lifecycle_stage: inboundSettings.default_lifecycle_stage || 'lead'
              })
              .select('id, full_name')
              .single()
            
            if (newContact) {
              contactId = newContact.id
              contactName = newContact.full_name
              console.log('Auto-created contact:', contactId)
            } else if (createError) {
              console.error('Error auto-creating contact:', createError)
            }
          }
        }
        
        // Create inbound call record
        const defaultUserId = phoneConfig.ring_users[0]
        
        const { error: insertError } = await supabase
          .from('calls')
          .insert({
            organization_id: phoneConfig.organization_id,
            user_id: defaultUserId,
            contact_id: contactId,
            direction: 'incoming',
            status: 'ringing',
            from_number: from,
            to_number: calledNumber,
            call_sid: params.CallSid,
            call_type: 'received',
            started_at: new Date().toISOString()
          })
        
        if (insertError) {
          console.error('Error creating inbound call record:', insertError)
        } else {
          console.log('Inbound call record created with SID:', params.CallSid, 'contact_id:', contactId)
        }
        
        return new Response(twiml, {
          headers: { 'Content-Type': 'text/xml' }
        })
      }
      // ========== END INBOUND CALL DETECTION ==========

      // Outbound call from browser (client:xxx)
      if (!to) {
        const errorTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Erro: número de destino não especificado.</Say>
</Response>`
        return new Response(errorTwiml, { 
          headers: { 'Content-Type': 'text/xml' } 
        })
      }

      // Get organization's Twilio config for caller ID and recording settings
      let callerId = ''
      let enableRecording = false

      if (orgId) {
        const { data: integration } = await supabase
          .from('organization_integrations')
          .select('config_values')
          .eq('organization_id', orgId)
          .single()

        if (integration?.config_values) {
          callerId = integration.config_values.phone_number || ''
          enableRecording = integration.config_values.enable_recording === true
        }
      }

      // Format phone number to E.164
      const formattedTo = formatToE164(to)
      console.log('Formatted phone number:', to, '->', formattedTo)

      // Build TwiML response
      const recordAttr = enableRecording ? ' record="record-from-answer-dual"' : ''
      const statusCallbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-webhook/status?orgId=${orgId || ''}`
      const recordingCallbackUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/twilio-webhook/recording?orgId=${orgId || ''}`

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial callerId="${callerId}" timeout="30"${recordAttr} action="${statusCallbackUrl}" recordingStatusCallback="${recordingCallbackUrl}">
    <Number statusCallbackEvent="initiated ringing answered completed" statusCallback="${statusCallbackUrl}">${formattedTo}</Number>
  </Dial>
</Response>`

      console.log('Returning TwiML:', twiml)

      return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // ========== ROUTE: /twiml (Legacy server-to-server calls) ==========
    if (path === 'twiml') {
      const to = url.searchParams.get('to')
      
      if (!to) {
        return new Response(
          '<?xml version="1.0" encoding="UTF-8"?><Response><Say language="pt-BR">Erro: número não especificado</Say></Response>',
          { headers: { 'Content-Type': 'text/xml' } }
        )
      }

      let callerId = params.From || ''

      if (orgId) {
        const { data: integration } = await supabase
          .from('organization_integrations')
          .select('config_values')
          .eq('organization_id', orgId)
          .single()

        if (integration?.config_values?.phone_number) {
          callerId = integration.config_values.phone_number
        }
      }

      const enableRecording = orgId ? await checkRecordingEnabled(supabase, orgId) : false

      const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say language="pt-BR">Conectando sua chamada. Por favor aguarde.</Say>
  <Dial callerId="${callerId}" timeout="30"${enableRecording ? ' record="record-from-answer-dual"' : ''}>
    <Number>${to}</Number>
  </Dial>
  <Say language="pt-BR">A chamada foi encerrada.</Say>
</Response>`

      return new Response(twiml, {
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // ========== ROUTE: /status ==========
    if (path === 'status') {
      const callSid = params.CallSid
      const callStatus = params.CallStatus?.toLowerCase()
      const duration = params.CallDuration ? parseInt(params.CallDuration) : null

      if (!callSid) {
        return new Response(null, { status: 204 })
      }

      const statusMap: Record<string, string> = {
        'queued': 'queued',
        'initiated': 'queued',
        'ringing': 'ringing',
        'in-progress': 'in-progress',
        'completed': 'completed',
        'busy': 'busy',
        'no-answer': 'no-answer',
        'canceled': 'canceled',
        'failed': 'failed',
      }

      const updateData: Record<string, any> = {
        status: statusMap[callStatus] || callStatus,
      }

      if (callStatus === 'in-progress' || callStatus === 'answered') {
        updateData.answered_at = new Date().toISOString()
      }

      if (['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(callStatus)) {
        updateData.ended_at = new Date().toISOString()
        if (duration) {
          updateData.duration_seconds = duration
        }
      }

      const { error } = await supabase
        .from('calls')
        .update(updateData)
        .eq('call_sid', callSid)

      if (error) {
        console.error('Error updating call status:', error)
      }

      console.log(`Call ${callSid} status updated to: ${callStatus}`)

      return new Response(null, { status: 204 })
    }

    // ========== ROUTE: /recording ==========
    if (path === 'recording') {
      const callSid = params.CallSid
      const recordingSid = params.RecordingSid
      const recordingUrl = params.RecordingUrl
      const recordingDuration = params.RecordingDuration ? parseInt(params.RecordingDuration) : null

      if (!callSid || !recordingSid || !recordingUrl) {
        return new Response(null, { status: 204 })
      }

      const { data: call } = await supabase
        .from('calls')
        .select('id, organization_id')
        .eq('call_sid', callSid)
        .single()

      if (call) {
        const { error } = await supabase
          .from('call_recordings')
          .insert({
            organization_id: call.organization_id,
            call_id: call.id,
            recording_sid: recordingSid,
            recording_url: recordingUrl + '.mp3',
            duration_seconds: recordingDuration,
          })

        if (error) {
          console.error('Error inserting recording:', error)
        }

        console.log(`Recording saved for call ${callSid}: ${recordingSid}`)
      }

      return new Response(null, { status: 204 })
    }

    return new Response('Not found', { status: 404 })

  } catch (error) {
    console.error('Webhook error:', error)
    return new Response(null, { status: 204 })
  }
})

async function checkRecordingEnabled(supabase: any, orgId: string): Promise<boolean> {
  try {
    const { data } = await supabase
      .from('organization_integrations')
      .select('config_values')
      .eq('organization_id', orgId)
      .single()
    
    return data?.config_values?.enable_recording === true
  } catch {
    return false
  }
}
