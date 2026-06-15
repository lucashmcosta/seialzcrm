// Backfill: vincula contatos antigos a marketing_campaigns usando sinais já capturados.
// Pode ser executada quantas vezes for necessário; só atualiza contatos ainda não vinculados.
//
// Ordem de prioridade (do mais robusto pro mais frouxo):
//   Camada 0 — contacts.meta_ad_id          → marketing_campaigns.ad_id   (LP nova)
//   Camada 1 — contacts.ad_referral_source_id → mc.ad_id ou mc.external_id (CTWA)
//   Camada 2 — utm_content/utm_campaign     → ad_name/adset_name/campaign_name (match único)
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

    // ─── Camada 0: meta_ad_id → mc.ad_id (mais robusto, sem ambiguidade) ───
    let q0 = supabase
      .from('contacts')
      .select('id, organization_id, meta_ad_id')
      .is('marketing_campaign_id', null)
      .is('deleted_at', null)
      .not('meta_ad_id', 'is', null)
      .limit(5000);
    if (organizationId) q0 = q0.eq('organization_id', organizationId);
    const { data: adIdContacts } = await q0;

    let layer0 = 0;
    for (const c of adIdContacts || []) {
      const { data: mc } = await supabase
        .from('marketing_campaigns')
        .select('id')
        .eq('organization_id', c.organization_id)
        .is('deleted_at', null)
        .eq('ad_id', c.meta_ad_id)
        .limit(1)
        .maybeSingle();
      if (mc?.id) {
        await supabase.from('contacts').update({ marketing_campaign_id: mc.id }).eq('id', c.id);
        layer0++;
      }
    }

    // ─── Camada 1: ad_referral_source_id (CTWA) ───
    let q1 = supabase
      .from('contacts')
      .select('id, organization_id, ad_referral_source_id')
      .is('marketing_campaign_id', null)
      .is('deleted_at', null)
      .not('ad_referral_source_id', 'is', null)
      .limit(5000);
    if (organizationId) q1 = q1.eq('organization_id', organizationId);
    const { data: ctwaContacts } = await q1;

    let layer1 = 0;
    for (const c of ctwaContacts || []) {
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

    // ─── Camada 2: UTM (relaxado) — só atribui se houver match único ───
    let q2 = supabase
      .from('contacts')
      .select('id, organization_id, utm_campaign, utm_content, utm_source, utm_medium')
      .is('marketing_campaign_id', null)
      .is('deleted_at', null)
      .or('utm_campaign.not.is.null,utm_content.not.is.null')
      .limit(5000);
    if (organizationId) q2 = q2.eq('organization_id', organizationId);
    const { data: utmContacts } = await q2;

    let layer2 = 0;
    for (const c of utmContacts || []) {
      const filters: string[] = [];
      // utm_content geralmente carrega o nome (ou id) do ad/adset
      if (c.utm_content) {
        filters.push(`ad_name.eq.${c.utm_content}`);
        filters.push(`adset_name.eq.${c.utm_content}`);
        filters.push(`ad_id.eq.${c.utm_content}`);
        filters.push(`adset_id.eq.${c.utm_content}`);
      }
      // utm_campaign pode ser id (template novo do Ads Manager) OU nome do ad/campanha (legado)
      if (c.utm_campaign) {
        filters.push(`ad_id.eq.${c.utm_campaign}`);
        filters.push(`campaign_name.eq.${c.utm_campaign}`);
        filters.push(`ad_name.eq.${c.utm_campaign}`);
      }
      if (filters.length === 0) continue;

      const { data: matches } = await supabase
        .from('marketing_campaigns')
        .select('id')
        .eq('organization_id', c.organization_id)
        .is('deleted_at', null)
        .or(filters.join(','))
        .limit(2);

      if (matches && matches.length === 1) {
        await supabase
          .from('contacts')
          .update({ marketing_campaign_id: matches[0].id })
          .eq('id', c.id);
        layer2++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        layer0_meta_ad_id: layer0,
        layer1_ctwa: layer1,
        layer2_utm: layer2,
        total: layer0 + layer1 + layer2,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
