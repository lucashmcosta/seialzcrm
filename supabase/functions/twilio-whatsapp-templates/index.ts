import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  )

  try {
    const url = new URL(req.url)
    const action = url.searchParams.get('action') || 'list'

    // ========== GET: List/Sync templates ==========
    if (req.method === 'GET') {
      const organizationId = url.searchParams.get('organizationId')
      
      if (!organizationId) {
        return new Response(
          JSON.stringify({ error: 'Missing organizationId' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // If sync action, fetch from Twilio and update DB
      if (action === 'sync') {
        // Get integration config
        const { data: integration } = await supabase
          .from('organization_integrations')
          .select('config_values, admin_integrations!inner(slug)')
          .eq('organization_id', organizationId)
          .eq('admin_integrations.slug', 'twilio-whatsapp')
          .eq('is_enabled', true)
          .single()

        if (!integration) {
          return new Response(
            JSON.stringify({ error: 'WhatsApp integration not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const config = integration.config_values as any
        const accountSid = config.account_sid
        const authToken = config.auth_token

        // Fetch templates from Twilio Content API
        const templatesUrl = 'https://content.twilio.com/v1/Content'
        
        const response = await fetch(templatesUrl, {
          headers: {
            'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          }
        })

        if (!response.ok) {
          const errorText = await response.text()
          console.error('Twilio Content API error:', errorText)
          return new Response(
            JSON.stringify({ error: 'Failed to fetch templates from Twilio' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const data = await response.json()
        const twilioTemplates = data.contents || []

        // Sync to database
        let synced = 0
        for (const template of twilioTemplates) {
          const types = template.types || {}
          const whatsappType = types['twilio/whatsapp'] || types['twilio/text'] || {}
          
          const { error } = await supabase
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

          if (!error) synced++
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            synced,
            total: twilioTemplates.length
          }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Default: list templates from DB
      const { data: templates, error } = await supabase
        .from('whatsapp_templates')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('friendly_name')

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to fetch templates' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ templates }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ========== POST: Create new template ==========
    if (req.method === 'POST') {
      const { 
        organizationId, 
        friendlyName, 
        body, 
        language,
        category,
        variables
      } = await req.json()

      if (!organizationId || !friendlyName || !body) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Get integration config
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select('config_values, admin_integrations!inner(slug)')
        .eq('organization_id', organizationId)
        .eq('admin_integrations.slug', 'twilio-whatsapp')
        .eq('is_enabled', true)
        .single()

      if (!integration) {
        return new Response(
          JSON.stringify({ error: 'WhatsApp integration not found' }),
          { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const config = integration.config_values as any
      const accountSid = config.account_sid
      const authToken = config.auth_token

      // Create template via Twilio Content API
      const createUrl = 'https://content.twilio.com/v1/Content'
      
      // Build template payload
      const templatePayload = {
        friendly_name: friendlyName,
        language: language || 'pt-BR',
        types: {
          'twilio/text': {
            body: body
          }
        }
      }

      // Add variables if present
      if (variables && variables.length > 0) {
        (templatePayload as any).variables = variables.reduce((acc: any, v: any, i: number) => {
          acc[String(i + 1)] = v.example || ''
          return acc
        }, {})
      }

      const response = await fetch(createUrl, {
        method: 'POST',
        headers: {
          'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(templatePayload)
      })

      const responseData = await response.json()

      if (!response.ok) {
        console.error('Twilio template creation error:', responseData)
        return new Response(
          JSON.stringify({ 
            error: 'Failed to create template in Twilio',
            details: responseData.message 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Save to database
      const { data: savedTemplate, error: saveError } = await supabase
        .from('whatsapp_templates')
        .insert({
          organization_id: organizationId,
          twilio_content_sid: responseData.sid,
          friendly_name: friendlyName,
          language: language || 'pt_BR',
          template_type: 'text',
          body: body,
          variables: variables || [],
          status: 'pending', // Templates need approval
          category: category || 'utility',
          last_synced_at: new Date().toISOString(),
        })
        .select()
        .single()

      if (saveError) {
        console.error('Error saving template to DB:', saveError)
      }

      return new Response(
        JSON.stringify({ 
          success: true,
          template: savedTemplate,
          twilioSid: responseData.sid
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ========== DELETE: Deactivate template ==========
    if (req.method === 'DELETE') {
      const { organizationId, templateId } = await req.json()

      if (!organizationId || !templateId) {
        return new Response(
          JSON.stringify({ error: 'Missing required fields' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // Soft delete by setting is_active to false
      const { error } = await supabase
        .from('whatsapp_templates')
        .update({ is_active: false })
        .eq('id', templateId)
        .eq('organization_id', organizationId)

      if (error) {
        return new Response(
          JSON.stringify({ error: 'Failed to deactivate template' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error: unknown) {
    console.error('Templates error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Internal server error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
