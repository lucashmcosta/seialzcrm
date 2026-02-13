import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// Normaliza telefone para formato E.164 (assume Brasil como padrão)
function normalizePhoneToE164(phone: string): string {
  if (!phone) return '';
  
  // Remove tudo que não é número ou +
  let cleaned = phone.replace(/[^\d+]/g, '');
  
  // Se já está em E.164 (começa com +), retorna como está
  if (cleaned.startsWith('+')) {
    return cleaned;
  }
  
  // Números brasileiros típicos: 10-11 dígitos (com DDD)
  // Se tem 10-11 dígitos e começa com DDD válido (11-99), assume Brasil
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    const ddd = parseInt(cleaned.substring(0, 2));
    if (ddd >= 11 && ddd <= 99) {
      return `+55${cleaned}`;
    }
  }
  
  // Para outros casos, assume Brasil por padrão
  return `+55${cleaned}`;
}

interface LeadPayload {
  name: string;
  email?: string;
  phone?: string;
  company?: string;
  source?: string;
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  notes?: string;
  create_opportunity?: boolean;
  opportunity_title?: string;
  opportunity_value?: number;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Get API key from header
    const apiKey = req.headers.get('x-api-key');
    
    if (!apiKey) {
      console.error('Missing x-api-key header');
      return new Response(
        JSON.stringify({ error: 'Missing API key. Include x-api-key header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with service role
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate API key and get organization
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('organization_api_keys')
      .select('id, organization_id, scopes, is_active')
      .eq('api_key', apiKey)
      .single();

    if (apiKeyError || !apiKeyData) {
      console.error('Invalid API key:', apiKeyError?.message);
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!apiKeyData.is_active) {
      console.error('API key is inactive');
      return new Response(
        JSON.stringify({ error: 'API key is inactive' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if key has leads:write scope
    const scopes = apiKeyData.scopes || [];
    if (!scopes.includes('leads:write')) {
      console.error('API key does not have leads:write scope');
      return new Response(
        JSON.stringify({ error: 'API key does not have permission to create leads' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const organizationId = apiKeyData.organization_id;

    // Parse request body
    const payload: LeadPayload = await req.json();

    // Validate required fields
    if (!payload.name || payload.name.trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Field "name" is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse name into first_name and last_name
    const nameParts = payload.name.trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    // Create contact
    const { data: contact, error: contactError } = await supabase
      .from('contacts')
      .insert({
        organization_id: organizationId,
        full_name: payload.name.trim(),
        first_name: firstName,
        last_name: lastName,
        email: payload.email || null,
        phone: payload.phone ? normalizePhoneToE164(payload.phone) : null,
        company_name: payload.company || null,
        source: payload.source || 'api',
        utm_source: payload.utm_source || null,
        utm_medium: payload.utm_medium || null,
        utm_campaign: payload.utm_campaign || null,
        lifecycle_stage: 'lead',
      })
      .select('id')
      .single();

    if (contactError) {
      console.error('Error creating contact:', contactError);
      return new Response(
        JSON.stringify({ error: 'Failed to create contact', details: contactError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const contactId = contact.id;
    let opportunityId: string | null = null;
    let activityId: string | null = null;

    // Create opportunity if requested
    if (payload.create_opportunity) {
      // Get first pipeline stage for this organization
      const { data: stages, error: stagesError } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('type', 'custom')
        .order('order_index', { ascending: true })
        .limit(1);

      if (stagesError || !stages || stages.length === 0) {
        console.error('Error getting pipeline stage:', stagesError?.message);
      } else {
        const { data: opportunity, error: opportunityError } = await supabase
          .from('opportunities')
          .insert({
            organization_id: organizationId,
            contact_id: contactId,
            pipeline_stage_id: stages[0].id,
            title: payload.opportunity_title || `Lead: ${payload.name}`,
            amount: payload.opportunity_value || 0,
            status: 'open',
          })
          .select('id')
          .single();

        if (opportunityError) {
          console.error('Error creating opportunity:', opportunityError);
          // Don't fail the whole request, just log the error
        } else {
          opportunityId = opportunity?.id || null;
        }
      }
    }

    // Create activity/note if notes provided (after opportunity so we can link it)
    if (payload.notes && payload.notes.trim() !== '') {
      const { data: activity, error: activityError } = await supabase
        .from('activities')
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          opportunity_id: opportunityId,
          activity_type: 'note',
          title: 'Nota do lead externo',
          body: payload.notes.trim(),
        })
        .select('id')
        .single();

      if (activityError) {
        console.error('Error creating activity:', activityError);
      } else {
        activityId = activity?.id || null;
      }
    }

    // Update last_used_at for the API key
    await supabase
      .from('organization_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyData.id);

    console.log(`Lead created successfully: contact_id=${contactId}, opportunity_id=${opportunityId}`);

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contactId,
        opportunity_id: opportunityId,
        activity_id: activityId,
        message: 'Lead created successfully',
      }),
      { status: 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error in lead-webhook:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
