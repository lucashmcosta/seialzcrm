import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { openOrgAi, OrgAiError, orgAiErrorResponse } from "../_shared/intelligence/org-ai.ts";

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

    const gate = await openOrgAi(req, organizationId, "knowledge_edit", corsHeaders);
    if (!gate.ok) return gate.response;
    const supabase = gate.admin;
    const userId: string = gate.userId;

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
    const productsContext = (products || []).map((p: any) => `- ${p.name} (slug: ${p.slug})`).join("\n");
    const itemsContext = (items || []).map((i: any) => {
      const product = products?.find((p: any) => p.id === i.product_id);
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
    const aiContent = await gate.ai([
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ]);

    if (!aiContent) {
      throw new Error("Empty AI response");
    }

    let parsedResponse;
    try {
      // Try to extract JSON from the response (AI sometimes adds text before/after)
      const jsonMatch = aiContent.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.error("No JSON found in AI response:", aiContent);
        throw new Error("No JSON found in AI response");
      }
      parsedResponse = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.error("Failed to parse AI response:", aiContent);
      throw new Error("Invalid AI response format");
    }

    // If AI understood and has changes, save to edit_requests
    if (parsedResponse.understood && parsedResponse.proposed_changes?.length > 0) {
      // Enrich proposed_changes with product_id
      const enrichedChanges = parsedResponse.proposed_changes.map((change: ProposedChange) => {
        if (change.product_slug) {
          const product = products?.find((p: any) => p.slug === change.product_slug);
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
    if (error instanceof OrgAiError) return orgAiErrorResponse(error, corsHeaders);
    console.error("Error processing knowledge edit:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
