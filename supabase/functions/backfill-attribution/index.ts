// Backfill: vincula contatos antigos a marketing_campaigns usando sinais já capturados.
// Pode ser executada quantas vezes for necessário; só atualiza contatos ainda não vinculados.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const body = await req.json().catch(() => ({}));
    const organizationId: string | undefined = body.organization_id;

    const orgFilter = organizationId ? `AND c.organization_id = '${organizationId}'` : '';

    // Camada 1: CTWA ad id
    const layer1Sql = `
      WITH updated AS (
        UPDATE contacts c
        SET marketing_campaign_id = mc.id
        FROM marketing_campaigns mc
        WHERE c.marketing_campaign_id IS NULL
          AND c.deleted_at IS NULL
          AND c.ad_referral_source_id IS NOT NULL
          AND mc.organization_id = c.organization_id
          AND mc.deleted_at IS NULL
          AND (mc.ad_id = c.ad_referral_source_id OR mc.external_id = c.ad_referral_source_id)
          ${orgFilter}
        RETURNING c.id
      )
      SELECT COUNT(*)::int AS n FROM updated;
    `;

    // Camada 2: UTM com match único
    const layer2Sql = `
      WITH candidates AS (
        SELECT c.id AS contact_id, mc.id AS campaign_id,
               COUNT(*) OVER (PARTITION BY c.id) AS n
        FROM contacts c
        JOIN marketing_campaigns mc
          ON mc.organization_id = c.organization_id
         AND mc.deleted_at IS NULL
         AND (
              (c.utm_content  IS NOT NULL AND (mc.ad_name = c.utm_content OR mc.adset_name = c.utm_content))
           OR (c.utm_campaign IS NOT NULL AND  mc.campaign_name = c.utm_campaign)
         )
        WHERE c.marketing_campaign_id IS NULL
          AND c.deleted_at IS NULL
          ${orgFilter}
      ), updated AS (
        UPDATE contacts c
        SET marketing_campaign_id = ca.campaign_id
        FROM candidates ca
        WHERE ca.contact_id = c.id AND ca.n = 1
        RETURNING c.id
      )
      SELECT COUNT(*)::int AS n FROM updated;
    `;

    // We can't run raw SQL via the JS client without an RPC, so use the
    // built-in postgrest "exec_sql" pattern via the underlying REST endpoint
    // is not available. Instead we replicate the logic in batches.

    // Camada 1 — iterate matching contacts and update
    const { data: ctwaContacts } = await supabase
      .from('contacts')
      .select('id, organization_id, ad_referral_source_id')
      .is('marketing_campaign_id', null)
      .is('deleted_at', null)
      .not('ad_referral_source_id', 'is', null)
      .limit(5000);

    let layer1 = 0;
    for (const c of ctwaContacts || []) {
      if (organizationId && c.organization_id !== organizationId) continue;
      const { data: mc } = await supabase
        .from('marketing_campaigns')
        .select('id')
        .eq('organization_id', c.organization_id)
        .is('deleted_at', null)
        .or(`ad_id.eq.${c.ad_referral_source_id},external_id.eq.${c.ad_referral_source_id}`)
        .limit(1)
        .maybeSingle();
      if (mc?.id) {
        await supabase.from('contacts').update({ marketing_campaign_id: mc.id }).eq('id', c.id);
        layer1++;
      }
    }

    // Camada 2 — UTM-based, match only when unique
    const { data: utmContacts } = await supabase
      .from('contacts')
      .select('id, organization_id, utm_campaign, utm_content')
      .is('marketing_campaign_id', null)
      .is('deleted_at', null)
      .or('utm_campaign.not.is.null,utm_content.not.is.null')
      .limit(5000);

    let layer2 = 0;
    for (const c of utmContacts || []) {
      if (organizationId && c.organization_id !== organizationId) continue;
      let q = supabase
        .from('marketing_campaigns')
        .select('id')
        .eq('organization_id', c.organization_id)
        .is('deleted_at', null);
      const filters: string[] = [];
      if (c.utm_content) {
        filters.push(`ad_name.eq.${c.utm_content}`);
        filters.push(`adset_name.eq.${c.utm_content}`);
      }
      if (c.utm_campaign) filters.push(`campaign_name.eq.${c.utm_campaign}`);
      if (filters.length === 0) continue;
      const { data: matches } = await q.or(filters.join(',')).limit(2);
      if (matches && matches.length === 1) {
        await supabase
          .from('contacts')
          .update({ marketing_campaign_id: matches[0].id })
          .eq('id', c.id);
        layer2++;
      }
    }

    return new Response(
      JSON.stringify({ ok: true, layer1, layer2, total: layer1 + layer2 }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
