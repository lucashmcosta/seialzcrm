import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EditRequest {
  organizationId: string;
  userRequest: string;
}

interface ProposedChange {
  item_id: string | null;
  action: "update" | "create" | "delete";
  category: string;
  scope: "global" | "product";
  product_slug: string | null;
  product_id: string | null;
  current_title: string | null;
  proposed_title: string | null;
  current_content: string | null;
  proposed_content: string | null;
  change_summary: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { organizationId, userRequest }: EditRequest = await req.json();

    if (!organizationId || !userRequest) {
      return new Response(
        JSON.stringify({ error: "organizationId and userRequest are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get auth user from request
    const authHeader = req.headers.get("Authorization");
    let userId: string | null = null;
    
    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        const { data: userData } = await supabase
          .from("users")
          .select("id")
          .eq("auth_user_id", user.id)
          .single();
        userId = userData?.id || null;
      }
    }

    console.log(`📝 Processing edit request for org ${organizationId}: "${userRequest.substring(0, 100)}..."`);

    // Fetch products
    const { data: products } = await supabase
      .from("products")
      .select("id, name, slug")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    // Fetch knowledge items
    const { data: items } = await supabase
      .from("knowledge_items")
      .select("id, title, category, scope, product_id, content, resolved_content")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    // Build context for AI
    const productsContext = (products || []).map(p => `- ${p.name} (slug: ${p.slug})`).join("\n");
    const itemsContext = (items || []).map(i => {
      const product = products?.find(p => p.id === i.product_id);
      return `- [${i.id}] "${i.title}" (category: ${i.category}, scope: ${i.scope}${product ? `, product: ${product.name}` : ""})`;
    }).join("\n");

    const systemPrompt = `Você é um assistente que processa pedidos de edição na base de conhecimento de uma organização.

## PRODUTOS DISPONÍVEIS
${productsContext || "(Nenhum produto cadastrado)"}

## ITENS DE CONHECIMENTO EXISTENTES
${itemsContext || "(Nenhum item cadastrado)"}

## CATEGORIAS VÁLIDAS (CHAVES EM INGLÊS)
general, contact_hours, payment, policies, scope, compliance, language_guide, glossary, product_service, pricing_plans, process, requirements, objections, qualification, faq, social_proof

## TAREFA
Analise o pedido do usuário e identifique:
1. Qual(is) item(ns) de conhecimento deve(m) ser alterado(s)
2. Que tipo de mudança (update, create, delete)
3. O conteúdo atualizado

RESPONDA APENAS COM JSON VÁLIDO no formato:
{
  "understood": true,
  "needs_clarification": null,
  "proposed_changes": [
    {
      "item_id": "uuid ou null se criar novo",
      "action": "update|create|delete",
      "category": "categoria válida",
      "scope": "global|product",
      "product_slug": "slug do produto ou null",
      "current_title": "título atual ou null",
      "proposed_title": "novo título ou null",
      "current_content": "conteúdo atual resumido ou null",
      "proposed_content": "conteúdo novo completo",
      "change_summary": "resumo da mudança em 1 frase"
    }
  ],
  "warnings": ["avisos se houver efeitos colaterais"],
  "explanation": "Explicação breve do que vai ser feito"
}

Se precisar de mais informações, responda com:
{
  "understood": false,
  "needs_clarification": "O que você precisa saber",
  "proposed_changes": [],
  "warnings": [],
  "explanation": null
}`;

    const userPrompt = `Pedido: ${userRequest}`;

    // Call AI to process the request
    if (!lovableApiKey) {
      return new Response(
        JSON.stringify({ 
          error: "AI not configured",
          understood: false,
          needs_clarification: "O sistema de IA não está configurado. Configure a LOVABLE_API_KEY."
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch("https://api.lovable.ai/api/chat", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: "json_object" },
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);
      throw new Error(`AI API error: ${aiResponse.status}`);
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;

    if (!aiContent) {
      throw new Error("Empty AI response");
    }

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(aiContent);
    } catch (e) {
      console.error("Failed to parse AI response:", aiContent);
      throw new Error("Invalid AI response format");
    }

    // If AI understood and has changes, save to edit_requests
    if (parsedResponse.understood && parsedResponse.proposed_changes?.length > 0) {
      // Enrich proposed_changes with product_id
      const enrichedChanges = parsedResponse.proposed_changes.map((change: ProposedChange) => {
        if (change.product_slug) {
          const product = products?.find(p => p.slug === change.product_slug);
          change.product_id = product?.id || null;
        }
        return change;
      });

      const { data: editRequest, error: insertError } = await supabase
        .from("knowledge_edit_requests")
        .insert({
          organization_id: organizationId,
          user_request: userRequest,
          proposed_changes: enrichedChanges,
          status: "pending",
          created_by: userId,
        })
        .select()
        .single();

      if (insertError) {
        console.error("Error saving edit request:", insertError);
        throw insertError;
      }

      console.log(`✅ Created edit request ${editRequest.id} with ${enrichedChanges.length} changes`);

      return new Response(
        JSON.stringify({
          success: true,
          requestId: editRequest.id,
          understood: true,
          proposedChanges: enrichedChanges,
          warnings: parsedResponse.warnings || [],
          explanation: parsedResponse.explanation,
          expiresAt: editRequest.expires_at,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // AI needs clarification or didn't understand
    return new Response(
      JSON.stringify({
        success: false,
        understood: parsedResponse.understood,
        needsClarification: parsedResponse.needs_clarification,
        proposedChanges: [],
        warnings: parsedResponse.warnings || [],
        explanation: parsedResponse.explanation,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error processing knowledge edit:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
