import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

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

/**
 * Detect media type from content type or URL
 */
function detectMediaType(contentType: string | null, url: string): string {
  if (contentType) {
    if (contentType.startsWith('image/')) return 'image'
    if (contentType.startsWith('audio/')) return 'audio'
    if (contentType.startsWith('video/')) return 'video'
    if (contentType.includes('sticker')) return 'sticker'
  }
  
  // Fallback to URL extension
  const lowerUrl = url.toLowerCase()
  if (lowerUrl.match(/\.(jpg|jpeg|png|gif|webp)$/)) return 'image'
  if (lowerUrl.match(/\.(ogg|mp3|wav|m4a|opus)$/)) return 'audio'
  if (lowerUrl.match(/\.(mp4|mov|avi|mkv)$/)) return 'video'
  
  return 'document'
}

/**
 * Download media from Twilio and upload to storage
 */
async function persistMedia(
  supabase: any,
  orgId: string,
  twilioAccountSid: string,
  twilioAuthToken: string,
  mediaUrls: string[],
  contentTypes: string[]
): Promise<{ urls: string[], mediaType: string | null }> {
  if (mediaUrls.length === 0) {
    return { urls: [], mediaType: null }
  }

  const persistedUrls: string[] = []
  let detectedMediaType: string | null = null

  for (let i = 0; i < mediaUrls.length; i++) {
    const mediaUrl = mediaUrls[i]
    const contentType = contentTypes[i] || null

    try {
      // Download from Twilio (requires authentication)
      const response = await fetch(mediaUrl, {
        headers: {
          'Authorization': 'Basic ' + btoa(`${twilioAccountSid}:${twilioAuthToken}`),
        }
      })

      if (!response.ok) {
        console.error(`Failed to download media from Twilio: ${response.status}`)
        // Fallback to original URL
        persistedUrls.push(mediaUrl)
        continue
      }

      const blob = await response.blob()
      const actualContentType = response.headers.get('content-type') || contentType
      const mediaType = detectMediaType(actualContentType, mediaUrl)
      
      if (!detectedMediaType) {
        detectedMediaType = mediaType
      }

      // Determine file extension
      let extension = 'bin'
      if (actualContentType) {
        const extMap: Record<string, string> = {
          'image/jpeg': 'jpg',
          'image/png': 'png',
          'image/gif': 'gif',
          'image/webp': 'webp',
          'audio/ogg': 'ogg',
          'audio/mpeg': 'mp3',
          'audio/mp4': 'm4a',
          'video/mp4': 'mp4',
          'application/pdf': 'pdf',
        }
        extension = extMap[actualContentType] || 'bin'
      }

      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${extension}`
      const filePath = `${orgId}/${fileName}`

      // Upload to storage
      const { error: uploadError } = await supabase.storage
        .from('whatsapp-media')
        .upload(filePath, blob, {
          contentType: actualContentType || 'application/octet-stream',
        })

      if (uploadError) {
        console.error('Failed to upload media to storage:', uploadError)
        // Fallback to original URL
        persistedUrls.push(mediaUrl)
        continue
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('whatsapp-media')
        .getPublicUrl(filePath)

      persistedUrls.push(publicUrl)
      console.log(`Media persisted: ${mediaUrl} -> ${publicUrl}`)

    } catch (error) {
      console.error('Error persisting media:', error)
      // Fallback to original URL
      persistedUrls.push(mediaUrl)
    }
  }

  return { urls: persistedUrls, mediaType: detectedMediaType }
}

serve(async (req) => {
  const url = new URL(req.url)
  const path = url.pathname.split('/').pop()
  const orgId = url.searchParams.get('orgId')

  // Enhanced logging for debugging
  console.log(`=== WhatsApp Webhook Request ===`)
  console.log(`Method: ${req.method}`)
  console.log(`Path: ${path}`)
  console.log(`Full URL: ${req.url}`)
  console.log(`OrgId: ${orgId}`)
  console.log(`Content-Type: ${req.headers.get('content-type')}`)
  console.log(`User-Agent: ${req.headers.get('user-agent')}`)

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  // Handle /ping route for connectivity testing
  if (path === 'ping') {
    console.log('Ping received - webhook is accessible!')
    return new Response('pong', { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    })
  }

  // Handle GET requests (some misconfigured webhooks use GET)
  if (req.method === 'GET') {
    console.log('GET request received - Search params:', Object.fromEntries(url.searchParams))
    return new Response('OK - Use POST for webhooks', { 
      status: 200, 
      headers: { ...corsHeaders, 'Content-Type': 'text/plain' } 
    })
  }

  if (!orgId) {
    console.error('Missing orgId parameter')
    return new Response('Missing orgId', { status: 400, headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    // Parse form data with error handling
    let params: Record<string, string> = {}
    try {
      const formData = await req.formData()
      formData.forEach((value, key) => {
        params[key] = value.toString()
      })
    } catch (parseError) {
      console.error('Error parsing form data:', parseError)
      // Try to read as text for debugging
      try {
        const bodyText = await req.text()
        console.log('Raw body (first 500 chars):', bodyText.slice(0, 500))
      } catch (e) {
        console.log('Could not read body as text')
      }
      // Return 200 to prevent Twilio retries
      return new Response('<?xml version="1.0" encoding="UTF-8"?><Response></Response>', { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'text/xml' } 
      })
    }

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
      const originalRepliedMessageSid = params.OriginalRepliedMessageSid || null
      
      // Collect media URLs and content types
      const rawMediaUrls: string[] = []
      const contentTypes: string[] = []
      for (let i = 0; i < numMedia; i++) {
        const mediaUrl = params[`MediaUrl${i}`]
        const contentType = params[`MediaContentType${i}`]
        if (mediaUrl) {
          rawMediaUrls.push(mediaUrl)
          contentTypes.push(contentType || '')
        }
      }

      console.log(`Inbound WhatsApp - From: ${from}, Body: ${body}, Media: ${numMedia}`)

      // Get Twilio credentials for media download
      let twilioAccountSid = ''
      let twilioAuthToken = ''
      
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('config_values, admin_integrations!inner(slug)')
        .eq('organization_id', orgId)
        .eq('admin_integrations.slug', 'twilio-whatsapp')
        .eq('is_enabled', true)
        .single()

      if (integration?.config_values) {
        const config = integration.config_values as any
        twilioAccountSid = config.account_sid || ''
        twilioAuthToken = config.auth_token || ''
      }

      // Persist media to storage
      const { urls: persistedMediaUrls, mediaType } = await persistMedia(
        supabase,
        orgId,
        twilioAccountSid,
        twilioAuthToken,
        rawMediaUrls,
        contentTypes
      )

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

      // Resolve reply_to_message_id from OriginalRepliedMessageSid (if customer replied to a message)
      let replyToMessageId: string | null = null
      if (originalRepliedMessageSid) {
        const { data: originalMessage } = await supabase
          .from('messages')
          .select('id')
          .eq('whatsapp_message_sid', originalRepliedMessageSid)
          .single()

        if (originalMessage) {
          replyToMessageId = originalMessage.id
          console.log('Resolved reply context - reply_to_message_id:', replyToMessageId)
        } else {
          console.log('Could not find original message for reply:', originalRepliedMessageSid)
        }
      }

      // Insert message with persisted media URLs
      const { error: messageError } = await supabase
        .from('messages')
        .insert({
          organization_id: orgId,
          thread_id: threadId,
          content: body,
          direction: 'inbound',
          whatsapp_message_sid: messageSid,
          whatsapp_status: 'delivered',
          media_urls: persistedMediaUrls,
          media_type: mediaType,
          sent_at: new Date().toISOString(),
          reply_to_message_id: replyToMessageId,
        })

      if (messageError) {
        console.error('Error inserting message:', messageError)
      } else {
        console.log('Message saved successfully with', persistedMediaUrls.length, 'media files', replyToMessageId ? '(reply)' : '')
      }

      // Create notification for contact owner
      if (contactOwnerId) {
        let notificationBody = body
        if (persistedMediaUrls.length > 0 && !body) {
          const mediaLabel = mediaType === 'audio' ? '🎵 Áudio' 
            : mediaType === 'image' ? '📷 Imagem'
            : mediaType === 'video' ? '🎬 Vídeo'
            : '📎 Mídia'
          notificationBody = mediaLabel
        }

        await supabase
          .from('notifications')
          .insert({
            user_id: contactOwnerId,
            organization_id: orgId,
            type: 'whatsapp_message',
            title: 'Nova mensagem WhatsApp',
            body: `${profileName || from}: ${notificationBody.slice(0, 100)}${notificationBody.length > 100 ? '...' : ''}`,
            entity_type: 'message',
            entity_id: threadId,
          })
      }

      // Create activity
      let activityTitle = 'Mensagem WhatsApp recebida'
      if (persistedMediaUrls.length > 0) {
        activityTitle = `Mensagem WhatsApp recebida (${mediaType || 'mídia'})`
      }

      await supabase
        .from('activities')
        .insert({
          organization_id: orgId,
          contact_id: contactId,
          activity_type: 'message',
          title: activityTitle,
          body: body.slice(0, 200) || (persistedMediaUrls.length > 0 ? '[Mídia]' : ''),
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
