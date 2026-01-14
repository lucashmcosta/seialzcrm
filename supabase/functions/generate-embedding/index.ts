import "https://deno.land/x/xhr@0.1.0/mod.ts";
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

async function generateEmbedding(text: string): Promise<number[]> {
  const response = await fetch('https://ai.gateway.lovable.dev/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${Deno.env.get('LOVABLE_API_KEY')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Embedding API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}

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
          const embedding = await generateEmbedding(item.content);
          
          const { data, error } = await supabase
            .from('knowledge_embeddings')
            .insert({
              organization_id: organizationId,
              agent_id: agentId || null,
              content: item.content,
              content_type: item.contentType,
              title: item.title || null,
              metadata: item.metadata || {},
              embedding: embedding,
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

    // Generate embedding
    console.log(`Generating embedding for content type: ${contentType}`);
    const embedding = await generateEmbedding(content);
    console.log(`Embedding generated, dimension: ${embedding.length}`);

    // Save to database
    const { data, error } = await supabase
      .from('knowledge_embeddings')
      .insert({
        organization_id: organizationId,
        agent_id: agentId || null,
        content,
        content_type: contentType,
        title: title || null,
        metadata: metadata || {},
        embedding: embedding,
      })
      .select('id')
      .single();

    if (error) {
      console.error('Database error:', error);
      throw error;
    }

    console.log(`Knowledge embedding saved with ID: ${data.id}`);

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
