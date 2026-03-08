import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Authenticate user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'No authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace('Bearer ', '')
    )
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { organization_id, opportunity_status = 'won' } = await req.json()

    if (!organization_id) {
      return new Response(JSON.stringify({ error: 'organization_id is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Verify user belongs to org
    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('id')
      .eq('user_id', user.id)
      .eq('organization_id', organization_id)
      .eq('is_active', true)
      .maybeSingle()

    // Also check via users table (auth_user_id mapping)
    let hasAccess = !!userOrg
    if (!hasAccess) {
      const { data: userRecord } = await supabase
        .from('users')
        .select('id')
        .eq('auth_user_id', user.id)
        .maybeSingle()

      if (userRecord) {
        const { data: orgCheck } = await supabase
          .from('user_organizations')
          .select('id')
          .eq('user_id', userRecord.id)
          .eq('organization_id', organization_id)
          .eq('is_active', true)
          .maybeSingle()
        hasAccess = !!orgCheck
      }
    }

    if (!hasAccess) {
      return new Response(JSON.stringify({ error: 'Access denied' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // 1. Get contacts with matching opportunities
    const { data: opportunities, error: oppError } = await supabase
      .from('opportunities')
      .select('id, title, amount, close_date, contact_id')
      .eq('organization_id', organization_id)
      .eq('status', opportunity_status)
      .is('deleted_at', null)
      .order('close_date', { ascending: false })

    if (oppError) throw oppError

    if (!opportunities || opportunities.length === 0) {
      return new Response(JSON.stringify({ error: `No opportunities with status "${opportunity_status}" found` }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Group by contact_id
    const contactIds = [...new Set(opportunities.map(o => o.contact_id).filter(Boolean))] as string[]

    // 2. Get contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('id, full_name, phone')
      .in('id', contactIds)

    const contactMap = new Map((contacts || []).map(c => [c.id, c]))

    // 3. Get threads for these contacts
    const { data: threads } = await supabase
      .from('message_threads')
      .select('id, contact_id')
      .eq('organization_id', organization_id)
      .in('contact_id', contactIds)

    const threadsByContact = new Map<string, string>()
    for (const t of threads || []) {
      if (t.contact_id) threadsByContact.set(t.contact_id, t.id)
    }

    // 4. Build export text
    const lines: string[] = []
    lines.push(`EXPORTAÇÃO DE CONVERSAS — Status: ${opportunity_status.toUpperCase()}`)
    lines.push(`Data: ${new Date().toISOString().slice(0, 16).replace('T', ' ')}`)
    lines.push(`Total de contatos: ${contactIds.length}`)
    lines.push('='.repeat(80))
    lines.push('')

    for (const contactId of contactIds) {
      const contact = contactMap.get(contactId)
      if (!contact) continue

      const contactOpps = opportunities.filter(o => o.contact_id === contactId)
      const threadId = threadsByContact.get(contactId)

      lines.push(`=== CONTATO: ${contact.full_name} | Tel: ${contact.phone || 'N/A'} ===`)
      for (const opp of contactOpps) {
        const valor = opp.amount ? `R$ ${Number(opp.amount).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}` : 'N/A'
        lines.push(`Oportunidade: ${opp.title} | Valor: ${valor} | Fechamento: ${opp.close_date || 'N/A'}`)
      }
      lines.push('')

      if (!threadId) {
        lines.push('[Sem conversas registradas]')
        lines.push('')
        lines.push('-'.repeat(80))
        lines.push('')
        continue
      }

      // Fetch messages in batches (max 1000 per query)
      let allMessages: any[] = []
      let page = 0
      const pageSize = 1000
      let hasMore = true

      while (hasMore) {
        const { data: msgs } = await supabase
          .from('messages')
          .select('content, sender_type, sender_name, created_at, message_type')
          .eq('thread_id', threadId)
          .is('deleted_at', null)
          .order('created_at', { ascending: true })
          .range(page * pageSize, (page + 1) * pageSize - 1)

        if (msgs && msgs.length > 0) {
          allMessages = allMessages.concat(msgs)
          hasMore = msgs.length === pageSize
          page++
        } else {
          hasMore = false
        }
      }

      if (allMessages.length === 0) {
        lines.push('[Sem mensagens]')
      } else {
        for (const msg of allMessages) {
          const ts = new Date(msg.created_at).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })
          const senderLabel = msg.sender_type === 'contact' ? 'Cliente' :
            msg.sender_type === 'system' ? `Agente IA` :
            `Agente - ${msg.sender_name || 'Humano'}`
          const type = msg.message_type && msg.message_type !== 'text' ? ` [${msg.message_type}]` : ''
          lines.push(`[${ts}] [${senderLabel}]${type}: ${msg.content || '[mídia]'}`)
        }
      }

      lines.push('')
      lines.push('-'.repeat(80))
      lines.push('')
    }

    const exportText = lines.join('\n')

    return new Response(exportText, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="conversas-${opportunity_status}-${new Date().toISOString().slice(0, 10)}.txt"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
