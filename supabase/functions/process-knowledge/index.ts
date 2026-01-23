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
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");

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

    // Generate embeddings for each chunk
    const chunksToInsert = [];
    
    for (const chunk of chunks) {
      // Prepare text for embedding (include title for context)
      const embeddingText = item.title 
        ? `${item.title}\n\n${chunk.content}`
        : chunk.content;

      let embedding: number[] | null = null;

      // Try to generate real embedding via Lovable AI Gateway
      if (lovableApiKey) {
        try {
          const embeddingResponse = await fetch(
            "https://ai.gateway.lovable.dev/v1/embeddings",
            {
              method: "POST",
              headers: {
                "Authorization": `Bearer ${lovableApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                model: "text-embedding-3-small",
                input: embeddingText,
              }),
            }
          );

          if (embeddingResponse.ok) {
            const embeddingData = await embeddingResponse.json();
            embedding = embeddingData.data?.[0]?.embedding;
            console.log(`✅ Generated embedding for chunk ${chunk.index + 1}/${chunks.length}`);
          } else {
            const errorText = await embeddingResponse.text();
            console.error(`❌ Embedding API error: ${embeddingResponse.status} - ${errorText}`);
          }
        } catch (embError) {
          console.error(`❌ Error generating embedding for chunk ${chunk.index}:`, embError);
        }
      }

      // If no embedding, generate a placeholder (all zeros - won't match anything)
      if (!embedding) {
        console.warn(`⚠️ Using placeholder embedding for chunk ${chunk.index}`);
        embedding = new Array(1536).fill(0);
      }

      chunksToInsert.push({
        organization_id: item.organization_id,
        item_id: item.id,
        chunk_index: chunk.index,
        content: chunk.content,
        embedding: JSON.stringify(embedding),
        metadata: chunk.metadata,
      });
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
