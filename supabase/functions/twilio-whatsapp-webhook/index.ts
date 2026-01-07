import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Normalize phone number for search
 */
function normalizePhoneForSearch(phone: string): string[] {
  // Remove whatsapp: prefix if present
  const cleaned = phone.replace('whatsapp:', '').replace(/[^\d+]/g, '')
  
  const variations = new Set<string>()
  
  variations.add(phone)
  variations.add(cleaned)
  
  // With and without +
  if (cleaned.startsWith('+')) {
    variations.add(cleaned.slice(1))
  } else {
    variations.add('+' + cleaned)
  }
  
  // Handle Brazil country code
  const digits = cleaned.replace('+', '')
  if (digits.startsWith('55') && digits.length >= 12) {
    const withoutCountry = digits.slice(2)
    variations.add(withoutCountry)
    variations.add('+55' + withoutCountry)
    variations.add('55' + withoutCountry)
  }
  
  if (!digits.startsWith('55') && digits.length >= 10 && digits.length <= 11) {
    variations.add('55' + digits)
    variations.add('+55' + digits)
  }
  
  return Array.from(variations)
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()
  const orgId = url.searchParams.get('orgId')

  console.log(`WhatsApp Webhook - Path: ${path}, OrgId: ${orgId}`)

  if (!orgId) {
    console.error('Missing orgId parameter')
    return new Response('Missing orgId', { status: 400 })
  }

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

    console.log(`WhatsApp Webhook ${path} params:`, JSON.stringify(params, null, 2))

    // ========== ROUTE: /inbound - Receive incoming WhatsApp messages ==========
    if (path === 'inbound') {
      const messageSid = params.MessageSid
      const from = params.From?.replace('whatsapp:', '') || ''
      const to = params.To?.replace('whatsapp:', '') || ''
      const body = params.Body || ''
      const profileName = params.ProfileName || ''
      const waId = params.WaId || ''
      const numMedia = parseInt(params.NumMedia || '0')
      
      // Collect media URLs
      const mediaUrls: string[] = []
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params[`MediaUrl${i}`]
        if (mediaUrl) {
          mediaUrls.push(mediaUrl)
        }
      }

      console.log(`Inbound WhatsApp - From: ${from}, Body: ${body}, Media: ${numMedia}`)

      // Find or create contact
      let contactId: string | null = null
      let contactOwnerId: string | null = null
      
      const phoneVariations = normalizePhoneForSearch(from)
      const orConditions = phoneVariations.map(p => `phone.eq.${p}`).join(',')
      
      const { data: existingContact } = await supabase
        .from('contacts')
        .select('id, owner_user_id, full_name')
        .eq('organization_id', orgId)
        .or(orConditions)
        .is('deleted_at', null)
        .limit(1)
        .single()

      if (existingContact) {
        contactId = existingContact.id
        contactOwnerId = existingContact.owner_user_id
        console.log('Found existing contact:', contactId)
      } else {
        // Auto-create contact
        const contactName = profileName || `WhatsApp ${from}`
        
        const { data: newContact, error: createError } = await supabase
          .from('contacts')
          .insert({
            organization_id: orgId,
            full_name: contactName,
            phone: from,
            source: 'whatsapp',
            lifecycle_stage: 'lead',
          })
          .select('id, owner_user_id')
          .single()

        if (newContact) {
          contactId = newContact.id
          contactOwnerId = newContact.owner_user_id
          console.log('Created new contact:', contactId)
        } else if (createError) {
          console.error('Error creating contact:', createError)
        }
      }

      if (!contactId) {
        console.error('Could not find or create contact')
        return new Response('OK', { status: 200 })
      }

      // Find or create message thread
      let threadId: string | null = null
      
      const { data: existingThread } = await supabase
        .from('message_threads')
        .select('id')
        .eq('organization_id', orgId)
        .eq('contact_id', contactId)
        .eq('channel', 'whatsapp')
        .limit(1)
        .single()

      if (existingThread) {
        threadId = existingThread.id
        
        // Update last inbound timestamp for 24h window tracking
        await supabase
          .from('message_threads')
          .update({
            whatsapp_last_inbound_at: new Date().toISOString(),
            external_id: waId,
            updated_at: new Date().toISOString(),
          })
          .eq('id', threadId)
          
        console.log('Updated existing thread:', threadId)
      } else {
        const { data: newThread, error: threadError } = await supabase
          .from('message_threads')
          .insert({
            organization_id: orgId,
            contact_id: contactId,
            channel: 'whatsapp',
            subject: 'WhatsApp',
            external_id: waId,
            whatsapp_last_inbound_at: new Date().toISOString(),
          })
          .select('id')
          .single()

        if (newThread) {
          threadId = newThread.id
          console.log('Created new thread:', threadId)
        } else if (threadError) {
          console.error('Error creating thread:', threadError)
          return new Response('OK', { status: 200 })
        }
      }

      // Insert message
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          organization_id: orgId,
          thread_id: threadId,
          content: body,
          direction: 'inbound',
          whatsapp_message_sid: messageSid,
          whatsapp_status: 'delivered',
          media_urls: mediaUrls,
          sent_at: new Date().toISOString(),
        })

      if (messageError) {
        console.error('Error inserting message:', messageError)
      } else {
        console.log('Message saved successfully')
      }

      // Create notification for contact owner
      if (contactOwnerId) {
        await supabase
          .from('notifications')
          .insert({
            user_id: contactOwnerId,
            organization_id: orgId,
            type: 'whatsapp_message',
            title: 'Nova mensagem WhatsApp',
            body: `${profileName || from}: ${body.slice(0, 100)}${body.length > 100 ? '...' : ''}`,
            entity_type: 'message',
            entity_id: threadId,
          })
      }

      // Create activity
      await supabase
        .from('activities')
        .insert({
          organization_id: orgId,
          contact_id: contactId,
          activity_type: 'message',
          title: 'Mensagem WhatsApp recebida',
          body: body.slice(0, 200),
          occurred_at: new Date().toISOString(),
        })

      // Return empty response (no auto-reply)
      return new Response('', { 
        status: 200,
        headers: { 'Content-Type': 'text/xml' }
      })
    }

    // ========== ROUTE: /status - Message status callbacks ==========
    if (path === 'status') {
      const messageSid = params.MessageSid
      const messageStatus = params.MessageStatus?.toLowerCase()
      const errorCode = params.ErrorCode
      const errorMessage = params.ErrorMessage

      console.log(`Status callback - SID: ${messageSid}, Status: ${messageStatus}`)

      if (!messageSid) {
        return new Response('OK', { status: 200 })
      }

      const statusMap: Record<string, string> = {
        'queued': 'sending',
        'sent': 'sent',
        'delivered': 'delivered',
        'read': 'read',
        'failed': 'failed',
        'undelivered': 'failed',
      }

      const updateData: Record<string, any> = {
        whatsapp_status: statusMap[messageStatus] || messageStatus,
      }

      if (errorCode) {
        updateData.error_code = errorCode
        updateData.error_message = errorMessage
      }

      const { error: updateError } = await supabase
        .from('messages')
        .update(updateData)
        .eq('whatsapp_message_sid', messageSid)

      if (updateError) {
        console.error('Error updating message status:', updateError)
      } else {
        console.log('Message status updated:', messageSid, messageStatus)
      }

      return new Response('OK', { status: 200 })
    }

    // Unknown path
    console.warn('Unknown webhook path:', path)
    return new Response('Not Found', { status: 404 })

  } catch (error: unknown) {
    console.error('Webhook error:', error)
    return new Response('Internal Server Error', { status: 500 })
  }
})
