import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const delay = (ms: number) => new Promise(r => setTimeout(r, ms));

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
    const { organization_id, subdomain, access_token } = await req.json();

    if (!organization_id || !subdomain || !access_token) {
      throw new Error("organization_id, subdomain, and access_token required");
    }

    const sanitizedSubdomain = subdomain
      .replace(/^https?:\/\//i, '')
      .replace(/\.kommo\.com.*$/i, '')
      .replace(/[\/\s]/g, '')
      .trim();

    const base = `https://${sanitizedSubdomain}.kommo.com/api/v4`;
    const hd = { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" };

    // Step 1: Fetch Kommo users and build mapping by email
    const usersResp = await apiFetch(`${base}/users`, { headers: hd });
    const kommoUsers = usersResp.status === 204 ? [] : ((await usersResp.json())._embedded?.users || []);

    // Step 2: Get Seialz users for this org
    const { data: orgUsers } = await sb
      .from("user_organizations")
      .select("user_id, users!inner(id, email, full_name)")
      .eq("organization_id", organization_id)
      .eq("is_active", true);

    // Step 3: Build kommo_user_id → seialz_user_id map by email match
    const uMap: Record<string, string> = {};
    const matchLog: any[] = [];

    // Also check existing kommo_user_mappings for manual mappings
    const { data: existingMappings } = await sb
      .from("kommo_user_mappings")
      .select("kommo_user_id, seialz_user_id")
      .eq("organization_id", organization_id)
      .not("seialz_user_id", "is", null);

    existingMappings?.forEach((m: any) => {
      uMap[String(m.kommo_user_id)] = m.seialz_user_id;
    });

    // Auto-match by email
    for (const ku of kommoUsers) {
      if (uMap[String(ku.id)]) continue; // already mapped
      if (!ku.email) continue;
      const match = orgUsers?.find((ou: any) => ou.users?.email?.toLowerCase() === ku.email.toLowerCase());
      if (match) {
        uMap[String(ku.id)] = (match as any).users.id;
        matchLog.push({ kommo_user: ku.name, kommo_email: ku.email, seialz_user: (match as any).users.full_name, method: "email_match" });
      }
    }

    // Get default user (first org admin)
    const { data: defaultUserData } = await sb
      .from("user_organizations")
      .select("user_id")
      .eq("organization_id", organization_id)
      .eq("is_active", true)
      .limit(1)
      .single();
    const defaultUserId = defaultUserData?.user_id || "";

    // Step 4: Fetch all Kommo contacts and leads with responsible_user_id
    let updated = 0, skipped = 0, notFound = 0;
    const PS = 250;

    // Process contacts
    let page = 1;
    let hasMore = true;
    while (hasMore) {
      const resp = await apiFetch(`${base}/contacts?page=${page}&limit=${PS}`, { headers: hd });
      if (resp.status === 204) break;
      const contacts = (await resp.json())._embedded?.contacts || [];
      if (contacts.length < PS) hasMore = false;

      for (const ct of contacts) {
        const ownerId = ct.responsible_user_id ? (uMap[String(ct.responsible_user_id)] || defaultUserId) : defaultUserId;
        if (!ownerId) { skipped++; continue; }

        const { data: existing } = await sb
          .from("contacts")
          .select("id, owner_user_id")
          .eq("organization_id", organization_id)
          .eq("source_external_id", `kommo_${ct.id}`)
          .is("deleted_at", null)
          .maybeSingle();

        if (!existing) { notFound++; continue; }
        
        // Only update if owner is different
        if (existing.owner_user_id !== ownerId) {
          await sb.from("contacts").update({ owner_user_id: ownerId }).eq("id", existing.id);
          updated++;
        } else {
          skipped++;
        }
      }

      page++;
      await delay(300);
    }

    // Process leads (opportunities)
    page = 1;
    hasMore = true;
    let updatedOpps = 0;
    while (hasMore) {
      const resp = await apiFetch(`${base}/leads?page=${page}&limit=${PS}`, { headers: hd });
      if (resp.status === 204) break;
      const leads = (await resp.json())._embedded?.leads || [];
      if (leads.length < PS) hasMore = false;

      for (const ld of leads) {
        const ownerId = ld.responsible_user_id ? (uMap[String(ld.responsible_user_id)] || defaultUserId) : defaultUserId;
        if (!ownerId) continue;

        const { data: existing } = await sb
          .from("opportunities")
          .select("id, owner_user_id")
          .eq("organization_id", organization_id)
          .eq("source_external_id", `kommo_${ld.id}`)
          .is("deleted_at", null)
          .maybeSingle();

        if (!existing) continue;
        if (existing.owner_user_id !== ownerId) {
          await sb.from("opportunities").update({ owner_user_id: ownerId }).eq("id", existing.id);
          updatedOpps++;
        }
      }

      page++;
      await delay(300);
    }

    // Also save mappings to kommo_user_mappings for future use
    for (const ku of kommoUsers) {
      const sid = uMap[String(ku.id)] || null;
      await sb.from("kommo_user_mappings").upsert({
        organization_id,
        kommo_user_id: ku.id,
        kommo_user_name: ku.name,
        kommo_user_email: ku.email,
        seialz_user_id: sid,
      }, { onConflict: "organization_id,kommo_user_id" });
    }

    return new Response(JSON.stringify({
      success: true,
      user_map_size: Object.keys(uMap).length,
      match_log: matchLog,
      contacts_updated: updated,
      contacts_skipped: skipped,
      contacts_not_found: notFound,
      opportunities_updated: updatedOpps,
      default_user_id: defaultUserId,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
