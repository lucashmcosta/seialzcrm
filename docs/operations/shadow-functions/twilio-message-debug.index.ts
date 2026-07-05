// ARQUIVO MORTO — recuperado do deploy ad-hoc v14 (2026-05-04) em 2026-07-05.
// Fora do caminho de deploy. Ver README.md neste diretorio.
// ----------------------------------------------------------------------------
// DESCARTÁVEL — função de debug pra investigar o que Twilio retorna ao buscar uma mensagem antiga.
// Objetivo: validar se Twilio Messages API retorna dados de Click-to-WhatsApp Ad referral pra mensagens passadas.
// Pode ser DELETADA depois do uso.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { organization_id, message_sid } = body;

    if (!organization_id || !message_sid) {
      return json({ error: 'Need organization_id and message_sid' }, 400);
    }

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // 1) Buscar credenciais Twilio da org
    const { data: integration, error: intErr } = await admin
      .from('organization_integrations')
      .select('config_values, integration_id, admin_integrations:integration_id (slug)')
      .eq('organization_id', organization_id)
      .eq('is_enabled', true);

    if (intErr) return json({ error: 'DB error', details: intErr.message }, 500);

    const twilioInt = (integration || []).find(
      (i: any) => i.admin_integrations?.slug === 'twilio-whatsapp'
    );

    if (!twilioInt) {
      return json({ error: 'No twilio-whatsapp integration found for org' }, 404);
    }

    const cfg = twilioInt.config_values || {};
    const accountSid = cfg.account_sid;
    const authToken = cfg.auth_token;

    if (!accountSid || !authToken) {
      return json({ error: 'Missing account_sid or auth_token' }, 500);
    }

    // 2) Tentar 3 endpoints da Twilio pra ver qual retorna referral data:
    const basicAuth = 'Basic ' + btoa(`${accountSid}:${authToken}`);
    const results: Record<string, any> = {};

    // Endpoint A: Programmable Messaging — GET /2010-04-01/Accounts/{Sid}/Messages/{MessageSid}.json
    try {
      const urlA = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${message_sid}.json`;
      const respA = await fetch(urlA, { headers: { Authorization: basicAuth } });
      const bodyA = await respA.json().catch(() => ({}));
      results.endpoint_a_messages_2010 = {
        url: urlA,
        status: respA.status,
        body: bodyA,
        keys_returned: Object.keys(bodyA),
        has_referral_anywhere: JSON.stringify(bodyA).toLowerCase().includes('referral')
          || JSON.stringify(bodyA).toLowerCase().includes('ctwa'),
      };
    } catch (e: any) {
      results.endpoint_a_messages_2010 = { error: e.message };
    }

    // Endpoint B: Tentar incluir hidden subresources via Pagesize ou expand
    try {
      const urlB = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages/${message_sid}.json?ShowAdditionalProperties=true`;
      const respB = await fetch(urlB, { headers: { Authorization: basicAuth } });
      const bodyB = await respB.json().catch(() => ({}));
      results.endpoint_b_with_extra_param = {
        url: urlB,
        status: respB.status,
        keys_returned: Object.keys(bodyB),
        has_referral_anywhere: JSON.stringify(bodyB).toLowerCase().includes('referral')
          || JSON.stringify(bodyB).toLowerCase().includes('ctwa'),
      };
    } catch (e: any) {
      results.endpoint_b_with_extra_param = { error: e.message };
    }

    // Endpoint C: Events Streams (se houver) — Sinks
    try {
      const urlC = `https://events.twilio.com/v1/Sinks?PageSize=5`;
      const respC = await fetch(urlC, { headers: { Authorization: basicAuth } });
      const bodyC = await respC.json().catch(() => ({}));
      results.endpoint_c_event_streams = {
        url: urlC,
        status: respC.status,
        sinks_count: bodyC.sinks?.length ?? 0,
        meta: bodyC.meta,
      };
    } catch (e: any) {
      results.endpoint_c_event_streams = { error: e.message };
    }

    return json({
      tested_message_sid: message_sid,
      organization_id,
      account_sid_prefix: accountSid.slice(0, 8) + '…',
      results,
      analysis: {
        endpoint_a_has_referral: results.endpoint_a_messages_2010?.has_referral_anywhere || false,
        recommendation: results.endpoint_a_messages_2010?.has_referral_anywhere
          ? 'JACKPOT — Twilio retorna referral! Podemos backfill direto.'
          : 'Twilio NÃO retorna referral via Messages API. Plano B: identificar via primeira mensagem padrão + corrigir webhook pra captura futura.',
      },
    });
  } catch (e: any) {
    console.error('Debug error:', e);
    return json({ error: e.message }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
