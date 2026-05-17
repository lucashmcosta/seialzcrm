import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const ORG_ID = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f';
const TEMPLATE_ID = '2445dad6-2155-41c1-ac30-a68fb9b2d2f7';

const CONTACTS: { id: string; name: string; phone: string }[] = [
  { id: '789e9f84-da09-48f9-9970-a60f23b5474d', name: 'Francisco Claudivan', phone: '+5561993135672' },
  { id: '726a5c45-4894-4447-81e5-f91b07e27a4a', name: 'José Américo', phone: '+558791108446' },
  { id: '8c2fdc70-99e8-430e-955c-2f25e6933581', name: 'José Percy Camargo', phone: '+554199579919' },
  { id: 'aa020c4f-48c5-45a8-bfd4-e3c3fe892cd8', name: 'Sivio Santos', phone: '+33998509594' },
  { id: '49b0ce0a-18ba-4c98-bfd6-a8aeb9198a92', name: 'Maria Francisca Teixeira', phone: '+5517981575053' },
  { id: '45169855-67a5-4f94-b3ef-877741068619', name: 'Carlos Piedade', phone: '+5562983131195' },
  { id: '8a25bfea-1d0b-4c67-ad48-98e605a61773', name: 'Fernando Rodrigues', phone: '+5593991182892' },
  { id: 'e612f739-50e1-4725-83bd-31c4fb14b248', name: 'Benedito Freitas', phone: '+5516992339789' },
  { id: 'dc1a7729-bc56-481b-bf60-303cd26b8fc8', name: 'Edilson Santos', phone: '+5521979082750' },
  { id: '8ad6550c-a51c-4259-b9cd-fe563414868a', name: 'Alinaldo Gomes', phone: '+556992395642' },
  { id: 'c97098c8-b51c-4da1-829f-1f51a6922002', name: 'Yuri A. Salles', phone: '+79998648008' },
  { id: '93bd98a0-90b6-4507-a81d-8065e15bbfd8', name: 'Olga Tranquilino', phone: '+5517991597721' },
  { id: '2da39ff0-421a-4898-8dcc-15198fe1361f', name: 'Luis Alberto Ferreira', phone: '+5591982133822' },
  { id: 'ac170d80-a49d-474d-8577-b19804ac47ec', name: 'Bruno Ferreira da Silva', phone: '+5521964889016' },
  { id: 'b5e98fa9-ca1e-4f83-b52b-6923986d398e', name: 'Sidalino Correia Filho', phone: '+554991286423' },
  { id: '319f74b0-5c10-4d67-8d18-de3af5946224', name: 'Maurilio Barreto', phone: '+5513992522992' },
  { id: '26a0fa26-079b-4d84-8167-b907b50aa2c7', name: 'Ana Lúcia Wenceslau', phone: '+5545999520421' },
  { id: 'd9ffc91d-7300-4130-9650-d51b6ed2f635', name: 'Reinaldo Guarnieri', phone: '+5516996222518' },
  { id: 'fe7aad3e-eaeb-4d9d-a5a9-1f674b45ae46', name: 'Kally Cardoso', phone: '+5595991651447' },
  { id: '1572970d-ff16-4d59-83d7-02922dd498fe', name: 'Francisca Guimarães', phone: '+5598981668537' },
  { id: 'f74984d2-b7db-42fc-b1e2-d0df9592f951', name: 'Wanderley Souza', phone: '+5521999575241' },
];

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const sendUrl = `${supabaseUrl}/functions/v1/twilio-whatsapp-send`;

  const results: any[] = [];

  for (const c of CONTACTS) {
    try {
      const r = await fetch(sendUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${serviceKey}`,
        },
        body: JSON.stringify({
          organizationId: ORG_ID,
          contactId: c.id,
          templateId: TEMPLATE_ID,
          templateVariables: {},
          isAgentMessage: false,
          senderName: 'Meta Lead Ads (backfill)',
        }),
      });
      const body = await r.json().catch(() => ({}));
      results.push({ name: c.name, phone: c.phone, status: r.status, ok: r.ok, sid: body?.messageSid, error: body?.error, details: body?.details });
      console.log(`[backfill] ${c.name} ${c.phone} -> ${r.status} ${body?.messageSid ?? body?.error ?? ''}`);
    } catch (e) {
      results.push({ name: c.name, phone: c.phone, ok: false, error: String(e) });
      console.error(`[backfill] ${c.name} EXC`, e);
    }
    await new Promise((res) => setTimeout(res, 300));
  }

  const success = results.filter((r) => r.ok).length;
  const failed = results.length - success;

  return new Response(JSON.stringify({ success, failed, total: results.length, results }, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
