import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
const PS = 250;
const MAX_TIME_MS = 45000; // 45s safety margin

async function apiFetch(url: string, opts: RequestInit, retries = 5): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    const r = await fetch(url, opts);
    if (r.ok || r.status === 204) return r;
    if (r.status === 429) { await delay(Math.pow(2, i) * 1000); continue; }
    throw new Error(`HTTP ${r.status}: ${await r.text()}`);
  }
  throw new Error("Max retries");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { organization_id, subdomain, access_token, cursor } = await req.json();

    if (!organization_id || !subdomain || !access_token) {
      throw new Error("organization_id, subdomain, and access_token required");
    }

    const startTime = Date.now();
    const sanitizedSubdomain = subdomain
      .replace(/^https?:\/\//i, '')
      .replace(/\.kommo\.com.*$/i, '')
      .replace(/[\/\s]/g, '')
      .trim();

    const base = `https://${sanitizedSubdomain}.kommo.com/api/v4`;
    const hd = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

    // State from cursor or defaults
    const state = cursor || { phase: "init", contacts_page: 1, leads_page: 1, uMap: {}, updated: 0, skipped: 0, notFound: 0, oppsUpdated: 0, matchLog: [] };

    // Phase: init - build user map
    if (state.phase === "init") {
      const usersResp = await apiFetch(`${base}/users`, { headers: hd });
      const kommoUsers = usersResp.status === 204 ? [] : ((await usersResp.json())._embedded?.users || []);

      const { data: orgUsers } = await sb
        .from("user_organizations")
        .select("user_id, users!inner(id, email, full_name)")
        .eq("organization_id", organization_id)
        .eq("is_active", true);

      const uMap: Record<string, string> = {};

      // Check existing mappings
      const { data: existingMappings } = await sb
        .from("kommo_user_mappings")
        .select("kommo_user_id, seialz_user_id")
        .eq("organization_id", organization_id)
        .not("seialz_user_id", "is", null);
      existingMappings?.forEach((m: any) => { uMap[String(m.kommo_user_id)] = m.seialz_user_id; });

      // Auto-match by email
      const matchLog: any[] = [];
      for (const ku of kommoUsers) {
        if (uMap[String(ku.id)]) continue;
        if (!ku.email) continue;
        const match = orgUsers?.find((ou: any) => ou.users?.email?.toLowerCase() === ku.email.toLowerCase());
        if (match) {
          uMap[String(ku.id)] = (match as any).users.id;
          matchLog.push({ kommo: ku.name, seialz: (match as any).users.full_name });
        }
      }

      // Save mappings
      for (const ku of kommoUsers) {
        await sb.from("kommo_user_mappings").upsert({
          organization_id, kommo_user_id: ku.id, kommo_user_name: ku.name,
          kommo_user_email: ku.email, seialz_user_id: uMap[String(ku.id)] || null,
        }, { onConflict: "organization_id,kommo_user_id" });
      }

      // Get default user
      const { data: defData } = await sb.from("user_organizations").select("user_id")
        .eq("organization_id", organization_id).eq("is_active", true).limit(1).single();

      state.uMap = uMap;
      state.defaultUserId = defData?.user_id || "";
      state.matchLog = matchLog;
      state.phase = "contacts";
      state.contacts_page = 1;
    }

    const uMap = state.uMap as Record<string, string>;
    const defaultUserId = state.defaultUserId || "";

    // Phase: contacts
    if (state.phase === "contacts") {
      let page = state.contacts_page;
      while (true) {
        if (Date.now() - startTime > MAX_TIME_MS) {
          state.contacts_page = page;
          return new Response(JSON.stringify({ continue: true, cursor: state, progress: `contacts page ${page}` }), 
            { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const resp = await apiFetch(`${base}/contacts?page=${page}&limit=${PS}`, { headers: hd });
        if (resp.status === 204) break;
        const contacts = (await resp.json())._embedded?.contacts || [];
        if (!contacts.length) break;

        for (const ct of contacts) {
          const ownerId = ct.responsible_user_id ? (uMap[String(ct.responsible_user_id)] || defaultUserId) : defaultUserId;
          if (!ownerId) { state.skipped++; continue; }

          const { data: existing } = await sb.from("contacts").select("id, owner_user_id")
            .eq("organization_id", organization_id).eq("source_external_id", `kommo_${ct.id}`)
            .is("deleted_at", null).maybeSingle();

          if (!existing) { state.notFound++; continue; }
          if (existing.owner_user_id !== ownerId) {
            await sb.from("contacts").update({ owner_user_id: ownerId }).eq("id", existing.id);
            state.updated++;
          } else {
            state.skipped++;
          }
        }

        if (contacts.length < PS) break;
        page++;
        await delay(200);
      }
      state.phase = "leads";
      state.leads_page = 1;
    }

    // Phase: leads (opportunities)
    if (state.phase === "leads") {
      let page = state.leads_page;
      while (true) {
        if (Date.now() - startTime > MAX_TIME_MS) {
          state.leads_page = page;
          return new Response(JSON.stringify({ continue: true, cursor: state, progress: `leads page ${page}` }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } });
        }

        const resp = await apiFetch(`${base}/leads?page=${page}&limit=${PS}`, { headers: hd });
        if (resp.status === 204) break;
        const leads = (await resp.json())._embedded?.leads || [];
        if (!leads.length) break;

        for (const ld of leads) {
          const ownerId = ld.responsible_user_id ? (uMap[String(ld.responsible_user_id)] || defaultUserId) : defaultUserId;
          if (!ownerId) continue;

          const { data: existing } = await sb.from("opportunities").select("id, owner_user_id")
            .eq("organization_id", organization_id).eq("source_external_id", `kommo_${ld.id}`)
            .is("deleted_at", null).maybeSingle();

          if (!existing) continue;
          if (existing.owner_user_id !== ownerId) {
            await sb.from("opportunities").update({ owner_user_id: ownerId }).eq("id", existing.id);
            state.oppsUpdated++;
          }
        }

        if (leads.length < PS) break;
        page++;
        await delay(200);
      }
      state.phase = "done";
    }

    return new Response(JSON.stringify({
      continue: false,
      success: true,
      user_map_size: Object.keys(uMap).length,
      match_log: state.matchLog,
      contacts_updated: state.updated,
      contacts_skipped: state.skipped,
      contacts_not_found: state.notFound,
      opportunities_updated: state.oppsUpdated,
      default_user_id: defaultUserId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
