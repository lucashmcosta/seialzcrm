import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface EmbeddingRequest {
  organizationId: string;
  agentId?: string;
  content: string;
  contentType: 'faq' | 'product' | 'instruction' | 'policy' | 'general';
  title?: string;
  metadata?: Record<string, any>;
}

interface BulkEmbeddingRequest {
  organizationId: string;
  agentId?: string;
  items: Array<{
    content: string;
    contentType: 'faq' | 'product' | 'instruction' | 'policy' | 'general';
    title?: string;
    metadata?: Record<string, any>;
  }>;
}

// Note: Lovable AI Gateway doesn't support embedding models.
// Knowledge is stored without embeddings - retrieval uses AI semantic search via chat completions.

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    
    // Check if it's a bulk request
    if (body.items && Array.isArray(body.items)) {
      const { organizationId, agentId, items } = body as BulkEmbeddingRequest;
      
      if (!organizationId || !items.length) {
        return new Response(
          JSON.stringify({ error: 'organizationId and items are required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const results = [];
      for (const item of items) {
        try {
          const { data, error } = await supabase
            .from('knowledge_embeddings')
            .insert({
              organization_id: organizationId,
              agent_id: agentId || null,
              content: item.content,
              content_type: item.contentType,
              title: item.title || null,
              metadata: item.metadata || {},
              embedding: null, // Embeddings not supported - using AI semantic search instead
            })
            .select('id')
            .single();

          if (error) throw error;
          results.push({ success: true, id: data.id, title: item.title });
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          results.push({ success: false, title: item.title, error: errorMessage });
        }
      }

      return new Response(
        JSON.stringify({ success: true, results }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Single item request
    const { organizationId, agentId, content, contentType, title, metadata } = body as EmbeddingRequest;
    
    if (!organizationId || !content || !contentType) {
      return new Response(
        JSON.stringify({ error: 'organizationId, content, and contentType are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Storing knowledge for content type: ${contentType}`);

    // Save to database without embedding (will use AI semantic search for retrieval)
    const { data, error } = await supabase
      .from('knowledge_embeddings')
      .insert({
        organization_id: organizationId,
        agent_id: agentId || null,
        content,
        content_type: contentType,
        title: title || null,
        metadata: metadata || {},
        embedding: null,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log(`Knowledge saved with ID: ${data.id}`);

    return new Response(
      JSON.stringify({ success: true, id: data.id }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});