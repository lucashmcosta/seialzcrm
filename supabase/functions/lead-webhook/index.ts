import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-api-key',
};

// Normaliza telefone para formato E.164 (assume Brasil como padrão)
function normalizePhoneToE164(phone: string): string {
  if (!phone) return '';
  let cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.length >= 10 && cleaned.length <= 11) {
    const ddd = parseInt(cleaned.substring(0, 2));
    if (ddd >= 11 && ddd <= 99) return `+55${cleaned}`;
  }
  return `+55${cleaned}`;
}

// Apply transform to a value
function applyTransform(value: string | null | undefined, transformType: string): string | null {
  if (value == null || value === '') return null;
  const strValue = String(value);
  switch (transformType) {
    case 'phone_e164': return normalizePhoneToE164(strValue);
    case 'lowercase': return strValue.toLowerCase();
    case 'uppercase': return strValue.toUpperCase();
    case 'direct':
    default: return strValue;
  }
}

interface LeadPayload {
  name?: string;
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
  [key: string]: unknown;
}

// Check if scopes array has a specific scope
function hasScope(scopes: string[], scope: string): boolean {
  return scopes.includes(scope);
}

// Check write access for contacts (backward compat with leads:write)
function hasContactWriteScope(scopes: string[]): boolean {
  return hasScope(scopes, 'contacts:write') || hasScope(scopes, 'leads:write');
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = req.headers.get('x-api-key');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'Missing API key. Include x-api-key header.' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate API key
    const { data: apiKeyData, error: apiKeyError } = await supabase
      .from('organization_api_keys')
      .select('id, organization_id, scopes, is_active')
      .eq('api_key', apiKey)
      .single();

    if (apiKeyError || !apiKeyData) {
      return new Response(
        JSON.stringify({ error: 'Invalid API key' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!apiKeyData.is_active) {
      return new Response(
        JSON.stringify({ error: 'API key is inactive' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const scopes: string[] = apiKeyData.scopes || [];
    const organizationId = apiKeyData.organization_id;

    // Update last_used_at
    await supabase
      .from('organization_api_keys')
      .update({ last_used_at: new Date().toISOString() })
      .eq('id', apiKeyData.id);

    // ==================== GET REQUEST ====================
    if (req.method === 'GET') {
      const url = new URL(req.url);
      const entity = url.searchParams.get('entity') || 'contacts';
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '50'), 100);
      const offset = parseInt(url.searchParams.get('offset') || '0');

      if (entity === 'contacts') {
        if (!hasScope(scopes, 'contacts:read')) {
          return new Response(
            JSON.stringify({ error: 'API key does not have contacts:read scope' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { data, error, count } = await supabase
          .from('contacts')
          .select('id, full_name, email, phone, company_name, source, lifecycle_stage, created_at', { count: 'exact' })
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        return new Response(
          JSON.stringify({ data, total: count, limit, offset }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (entity === 'opportunities') {
        if (!hasScope(scopes, 'opportunities:read')) {
          return new Response(
            JSON.stringify({ error: 'API key does not have opportunities:read scope' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { data, error, count } = await supabase
          .from('opportunities')
          .select('id, title, amount, status, contact_id, created_at', { count: 'exact' })
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        return new Response(
          JSON.stringify({ data, total: count, limit, offset }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      if (entity === 'activities') {
        if (!hasScope(scopes, 'activities:read')) {
          return new Response(
            JSON.stringify({ error: 'API key does not have activities:read scope' }),
            { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        const { data, error, count } = await supabase
          .from('activities')
          .select('id, title, body, activity_type, contact_id, occurred_at', { count: 'exact' })
          .eq('organization_id', organizationId)
          .is('deleted_at', null)
          .order('occurred_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;
        return new Response(
          JSON.stringify({ data, total: count, limit, offset }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ error: 'Invalid entity. Use: contacts, opportunities, activities' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ==================== POST REQUEST ====================
    if (req.method !== 'POST') {
      return new Response(
        JSON.stringify({ error: 'Method not allowed. Use GET or POST.' }),
        { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check write scope
    if (!hasContactWriteScope(scopes)) {
      return new Response(
        JSON.stringify({ error: 'API key does not have permission to create leads. Required: contacts:write or leads:write' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const rawPayload: LeadPayload = await req.json();

    // ---- Field Mapping ----
    // Fetch inbound field mappings for this org
    const { data: contactMappings } = await supabase
      .from('webhook_field_mappings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('direction', 'inbound')
      .eq('entity_type', 'contact');

    const { data: opportunityMappings } = await supabase
      .from('webhook_field_mappings')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('direction', 'inbound')
      .eq('entity_type', 'opportunity');

    let payload: LeadPayload;

    if (contactMappings && contactMappings.length > 0) {
      // Apply field mapping: translate external fields to internal
      const mapped: Record<string, unknown> = {};

      // Check required fields
      for (const m of contactMappings) {
        const rawValue = rawPayload[m.external_field];
        const value = rawValue != null ? applyTransform(String(rawValue), m.transform_type) : (m.default_value || null);

        if (m.is_required && (value == null || value === '')) {
          return new Response(
            JSON.stringify({ error: `Required field "${m.external_field}" is missing` }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }

        if (value != null) {
          mapped[m.internal_field] = value;
        }
      }

      // Build the payload from mapped fields
      payload = {
        name: (mapped.full_name as string) || rawPayload.name || '',
        email: (mapped.email as string) || rawPayload.email,
        phone: (mapped.phone as string) || rawPayload.phone,
        company: (mapped.company_name as string) || rawPayload.company,
        source: (mapped.source as string) || rawPayload.source,
        utm_source: (mapped.utm_source as string) || rawPayload.utm_source,
        utm_medium: (mapped.utm_medium as string) || rawPayload.utm_medium,
        utm_campaign: (mapped.utm_campaign as string) || rawPayload.utm_campaign,
        notes: (mapped.notes as string) || rawPayload.notes,
        create_opportunity: rawPayload.create_opportunity,
        opportunity_title: rawPayload.opportunity_title,
        opportunity_value: rawPayload.opportunity_value,
      };

      // Handle opportunity mappings
      if (opportunityMappings && opportunityMappings.length > 0) {
        for (const m of opportunityMappings) {
          const rawValue = rawPayload[m.external_field];
          const value = rawValue != null ? applyTransform(String(rawValue), m.transform_type) : (m.default_value || null);
          if (value != null) {
            if (m.internal_field === 'title') payload.opportunity_title = value;
            if (m.internal_field === 'amount') { payload.opportunity_value = parseFloat(value); payload.create_opportunity = true; }
            if (m.internal_field === 'source') payload.source = value;
          }
        }
        // If any opportunity mapping matched, auto-enable create_opportunity
        if (payload.opportunity_title || payload.opportunity_value) {
          payload.create_opportunity = true;
        }
      }

      console.log('Field mapping applied. Translated payload:', JSON.stringify(payload));
    } else {
      // No mapping configured — use raw payload as-is (backward compatible)
      payload = rawPayload;
    }

    // Validate required fields
    if (!payload.name || String(payload.name).trim() === '') {
      return new Response(
        JSON.stringify({ error: 'Field "name" (or mapped equivalent) is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse name
    const nameParts = String(payload.name).trim().split(' ');
    const firstName = nameParts[0];
    const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : null;

    // Duplicate check
    const { data: orgSettings } = await supabase
      .from('organizations')
      .select('duplicate_check_mode, duplicate_enforce_block')
      .eq('id', organizationId)
      .single();

    const duplicateCheckMode = orgSettings?.duplicate_check_mode || 'none';
    const duplicateEnforceBlock = orgSettings?.duplicate_enforce_block ?? false;

    let existingContactId: string | null = null;
    let existingContactName: string | null = null;
    let duplicateField: string | null = null;

    if (duplicateCheckMode !== 'none') {
      const normalizedPhone = payload.phone ? normalizePhoneToE164(payload.phone) : null;
      const normalizedEmail = payload.email?.trim().toLowerCase() || null;

      if (duplicateCheckMode === 'phone' && normalizedPhone) {
        const { data: dup } = await supabase.from('contacts').select('id, full_name').eq('organization_id', organizationId).eq('phone', normalizedPhone).is('deleted_at', null).limit(1).maybeSingle();
        if (dup) { existingContactId = dup.id; existingContactName = dup.full_name; duplicateField = 'phone'; }
      } else if (duplicateCheckMode === 'email' && normalizedEmail) {
        const { data: dup } = await supabase.from('contacts').select('id, full_name').eq('organization_id', organizationId).eq('email', normalizedEmail).is('deleted_at', null).limit(1).maybeSingle();
        if (dup) { existingContactId = dup.id; existingContactName = dup.full_name; duplicateField = 'email'; }
      } else if (duplicateCheckMode === 'email_or_phone') {
        if (normalizedPhone) {
          const { data: dup } = await supabase.from('contacts').select('id, full_name').eq('organization_id', organizationId).eq('phone', normalizedPhone).is('deleted_at', null).limit(1).maybeSingle();
          if (dup) { existingContactId = dup.id; existingContactName = dup.full_name; duplicateField = 'phone'; }
        }
        if (!existingContactId && normalizedEmail) {
          const { data: dup } = await supabase.from('contacts').select('id, full_name').eq('organization_id', organizationId).eq('email', normalizedEmail).is('deleted_at', null).limit(1).maybeSingle();
          if (dup) { existingContactId = dup.id; existingContactName = dup.full_name; duplicateField = 'email'; }
        }
      }
    }

    let contactId: string;
    let duplicateReused = false;

    if (existingContactId) {
      if (duplicateEnforceBlock) {
        return new Response(
          JSON.stringify({ error: 'Duplicate contact found', existing_contact_id: existingContactId, existing_contact_name: existingContactName, duplicate_field: duplicateField }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      contactId = existingContactId;
      duplicateReused = true;
    } else {
      const { data: contact, error: contactError } = await supabase
        .from('contacts')
        .insert({
          organization_id: organizationId,
          full_name: String(payload.name).trim(),
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
        return new Response(
          JSON.stringify({ error: 'Failed to create contact', details: contactError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      contactId = contact.id;
    }

    let opportunityId: string | null = null;
    let activityId: string | null = null;

    if (payload.create_opportunity) {
      const { data: stages } = await supabase
        .from('pipeline_stages')
        .select('id')
        .eq('organization_id', organizationId)
        .eq('type', 'custom')
        .order('order_index', { ascending: true })
        .limit(1);

      if (stages && stages.length > 0) {
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

        if (!opportunityError) opportunityId = opportunity?.id || null;
      }
    }

    if (payload.notes && String(payload.notes).trim() !== '') {
      const { data: activity, error: activityError } = await supabase
        .from('activities')
        .insert({
          organization_id: organizationId,
          contact_id: contactId,
          opportunity_id: opportunityId,
          activity_type: 'note',
          title: 'Nota do lead externo',
          body: String(payload.notes).trim(),
        })
        .select('id')
        .single();

      if (!activityError) activityId = activity?.id || null;
    }

    console.log(`Lead processed: contact_id=${contactId}, opportunity_id=${opportunityId}, mapping=${contactMappings && contactMappings.length > 0 ? 'yes' : 'no'}`);

    return new Response(
      JSON.stringify({
        success: true,
        contact_id: contactId,
        opportunity_id: opportunityId,
        activity_id: activityId,
        message: duplicateReused ? 'Existing contact reused' : 'Lead created successfully',
        duplicate_reused: duplicateReused,
      }),
      { status: duplicateReused ? 200 : 201, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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
