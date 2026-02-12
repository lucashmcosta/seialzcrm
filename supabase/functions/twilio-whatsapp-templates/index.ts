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

          // Fetch real approval status
          let templateStatus = 'draft'
          let templateCategory = 'utility'
          let rejectionReason: string | null = null

          try {
            const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`
            const approvalResp = await fetch(approvalUrl, {
              headers: { 'Authorization': 'Basic ' + btoa(`${accountSid}:${authToken}`) }
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
              status: templateStatus,
              category: templateCategory,
              rejection_reason: rejectionReason,
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

    // ========== POST: Create template or perform actions ==========
    if (req.method === 'POST') {
      const reqBody = await req.json()
      const postAction = reqBody.action || 'create'

      // ---- Action: sync (POST version for supabase.functions.invoke) ----
      if (postAction === 'sync') {
        const organizationId = reqBody.organizationId
        if (!organizationId) {
          return new Response(
            JSON.stringify({ error: 'Missing organizationId' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

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
        const authHeaderVal = 'Basic ' + btoa(`${accountSid}:${authToken}`)

        const response = await fetch('https://content.twilio.com/v1/Content', {
          headers: { 'Authorization': authHeaderVal }
        })

        if (!response.ok) {
          console.error('Twilio Content API error:', await response.text())
          return new Response(
            JSON.stringify({ error: 'Failed to fetch templates from Twilio' }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        const data = await response.json()
        const twilioTemplates = data.contents || []

        let synced = 0
        for (const template of twilioTemplates) {
          const types = template.types || {}
          const whatsappType = types['twilio/whatsapp'] || types['twilio/text'] || {}

          // Fetch real approval status
          let templateStatus = 'draft'
          let templateCategory = 'utility'
          let rejectionReason: string | null = null

          try {
            const approvalUrl = `https://content.twilio.com/v1/Content/${template.sid}/ApprovalRequests`
            const approvalResp = await fetch(approvalUrl, {
              headers: { 'Authorization': authHeaderVal }
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
              status: templateStatus,
              category: templateCategory,
              rejection_reason: rejectionReason,
              last_synced_at: new Date().toISOString(),
            }, { onConflict: 'organization_id,twilio_content_sid' })

          if (!error) synced++
        }

        return new Response(
          JSON.stringify({ success: true, synced, total: twilioTemplates.length }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ---- Action: submit-approval ----
      if (postAction === 'submit-approval') {
        const { organizationId, templateId, category: approvalCategory } = reqBody

        if (!organizationId || !templateId || !approvalCategory) {
          return new Response(
            JSON.stringify({ error: 'Missing required fields: organizationId, templateId, category' }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get template from DB
        const { data: templateRow } = await supabase
          .from('whatsapp_templates')
          .select('twilio_content_sid, friendly_name')
          .eq('id', templateId)
          .eq('organization_id', organizationId)
          .single()

        if (!templateRow) {
          return new Response(
            JSON.stringify({ error: 'Template not found' }),
            { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Get credentials
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
        const authHeaderVal = 'Basic ' + btoa(`${config.account_sid}:${config.auth_token}`)

        // Submit to Twilio
        const approvalUrl = `https://content.twilio.com/v1/Content/${templateRow.twilio_content_sid}/ApprovalRequests`
        const approvalResp = await fetch(approvalUrl, {
          method: 'POST',
          headers: {
            'Authorization': authHeaderVal,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: templateRow.friendly_name,
            category: approvalCategory,
          })
        })

        if (!approvalResp.ok) {
          const errorData = await approvalResp.text()
          console.error('Twilio approval submission error:', errorData)
          return new Response(
            JSON.stringify({ error: 'Failed to submit for approval', details: errorData }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }

        // Update status in DB
        await supabase
          .from('whatsapp_templates')
          .update({ status: 'pending', category: approvalCategory.toLowerCase() })
          .eq('id', templateId)
          .eq('organization_id', organizationId)

        return new Response(
          JSON.stringify({ success: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ---- Action: create (default) ----
      const { 
        organizationId, 
        friendlyName, 
        body, 
        language,
        category,
        variables
      } = reqBody

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
