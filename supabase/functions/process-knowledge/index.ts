import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ProcessRequest {
  itemId: string;
  content: string;
}

interface ChunkMetadata {
  index: number;
  charCount: number;
  tokenEstimate: number;
}

// Chunk content with overlap for better context
function chunkContent(
  content: string,
  maxChunkSize: number = 1500,
  overlap: number = 200
): { content: string; index: number; metadata: ChunkMetadata }[] {
  const chunks: { content: string; index: number; metadata: ChunkMetadata }[] = [];
  
  // Clean and normalize content
  const cleanContent = content
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  if (cleanContent.length <= maxChunkSize) {
    return [{
      content: cleanContent,
      index: 0,
      metadata: {
        index: 0,
        charCount: cleanContent.length,
        tokenEstimate: Math.ceil(cleanContent.length / 4),
      },
    }];
  }
  
  // Split by paragraphs first
  const paragraphs = cleanContent.split(/\n\n+/);
  let currentChunk = '';
  let chunkIndex = 0;
  
  for (const paragraph of paragraphs) {
    // If adding this paragraph exceeds max size
    if (currentChunk.length + paragraph.length + 2 > maxChunkSize) {
      // Save current chunk if it has content
      if (currentChunk.trim()) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex,
          metadata: {
            index: chunkIndex,
            charCount: currentChunk.trim().length,
            tokenEstimate: Math.ceil(currentChunk.trim().length / 4),
          },
        });
        chunkIndex++;
        
        // Start new chunk with overlap from end of current
        const words = currentChunk.trim().split(/\s+/);
        const overlapWords = words.slice(-Math.ceil(overlap / 5));
        currentChunk = overlapWords.join(' ') + '\n\n';
      }
    }
    
    currentChunk += paragraph + '\n\n';
  }
  
  // Don't forget the last chunk
  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
      metadata: {
        index: chunkIndex,
        charCount: currentChunk.trim().length,
        tokenEstimate: Math.ceil(currentChunk.trim().length / 4),
      },
    });
  }
  
  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { itemId, content }: ProcessRequest = await req.json();

    if (!itemId || !content) {
      return new Response(
        JSON.stringify({ error: "itemId and content are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const voyageApiKey = Deno.env.get("VOYAGE_API_KEY");

    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`📦 Processing knowledge item: ${itemId}`);

    // Fetch the item to get metadata
    const { data: item, error: itemError } = await supabase
      .from("knowledge_items")
      .select("*")
      .eq("id", itemId)
      .single();

    if (itemError || !item) {
      throw new Error(`Item not found: ${itemId}`);
    }

    // Chunk the content
    const chunks = chunkContent(content, 1500, 200);
    console.log(`📄 Generated ${chunks.length} chunks from ${content.length} characters`);

    // Prepare texts for BATCH embedding (include title for context)
    const textsToEmbed = chunks.map(chunk => 
      item.title ? `${item.title}\n\n${chunk.content}` : chunk.content
    );

    let embeddings: number[][] = [];

    // Generate embeddings via Voyage AI (BATCH request)
    if (voyageApiKey) {
      try {
        console.log(`🚀 Generating ${textsToEmbed.length} embeddings via Voyage AI (batch)...`);
        
        const embeddingResponse = await fetch(
          "https://api.voyageai.com/v1/embeddings",
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${voyageApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "voyage-3",
              input: textsToEmbed, // Array de textos (até 128)
              input_type: "document",
            }),
          }
        );

        if (embeddingResponse.ok) {
          const embeddingData = await embeddingResponse.json();
          embeddings = embeddingData.data?.map((d: any) => d.embedding) || [];
          console.log(`✅ Voyage AI generated ${embeddings.length} embeddings (${embeddings[0]?.length || 0} dimensions)`);
        } else {
          const errorText = await embeddingResponse.text();
          console.error(`❌ Voyage AI error: ${embeddingResponse.status} - ${errorText}`);
        }
      } catch (embError) {
        console.error(`❌ Error generating Voyage embeddings:`, embError);
      }
    } else {
      console.warn('⚠️ VOYAGE_API_KEY not configured');
    }

    // Build chunks to insert
    const chunksToInsert = chunks.map((chunk, i) => ({
      organization_id: item.organization_id,
      item_id: item.id,
      chunk_index: chunk.index,
      content: chunk.content,
      embedding: JSON.stringify(embeddings[i] || new Array(1024).fill(0)), // 1024 dimensions for Voyage AI
      metadata: chunk.metadata,
    }));

    // Log warning if using placeholder embeddings
    if (embeddings.length === 0) {
      console.warn(`⚠️ Using placeholder embeddings for all ${chunks.length} chunks`);
    }

    // Insert all chunks
    const { error: insertError } = await supabase
      .from("knowledge_chunks")
      .insert(chunksToInsert);

    if (insertError) {
      console.error("Error inserting chunks:", insertError);
      throw insertError;
    }

    console.log(`✅ Inserted ${chunksToInsert.length} chunks`);

    // Update item status to published
    const { error: updateError } = await supabase
      .from("knowledge_items")
      .update({
        status: "published",
        metadata: {
          ...item.metadata,
          char_count: content.length,
          chunk_count: chunks.length,
          embedding_model: "voyage-3",
          embedding_dimensions: 1024,
          processed_at: new Date().toISOString(),
        },
      })
      .eq("id", itemId);

    if (updateError) {
      console.error("Error updating item status:", updateError);
      throw updateError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        itemId,
        chunksCreated: chunks.length,
        totalCharacters: content.length,
        embeddingsGenerated: embeddings.length > 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error processing knowledge:", error);

    // Try to mark item as error if we have itemId
    try {
      const body = await req.clone().json();
      if (body.itemId) {
        const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
        const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
        const supabase = createClient(supabaseUrl, supabaseKey);
        
        await supabase
          .from("knowledge_items")
          .update({
            status: "error",
            error_message: error instanceof Error ? error.message : "Unknown error",
          })
          .eq("id", body.itemId);
      }
    } catch {}

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
