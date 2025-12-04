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

    // ========== ROUTE: /twiml ==========
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
