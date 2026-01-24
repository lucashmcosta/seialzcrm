import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ReprocessRequest {
  itemId?: string;
  itemIds?: string[];
  organizationId?: string;
}

interface KnowledgeItem {
  id: string;
  title: string;
  type: string;
  organization_id: string;
  metadata: Record<string, any>;
}

// Chunk content into smaller pieces for embedding
function chunkContent(content: string, maxChunkSize: number = 1500, overlap: number = 200): { content: string; index: number }[] {
  const chunks: { content: string; index: number }[] = [];
  const normalizedContent = content.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const paragraphs = normalizedContent.split(/\n\n+/);

  let currentChunk = "";
  let chunkIndex = 0;

  for (const paragraph of paragraphs) {
    const trimmedParagraph = paragraph.trim();
    if (!trimmedParagraph) continue;

    if (currentChunk.length + trimmedParagraph.length + 2 > maxChunkSize) {
      if (currentChunk) {
        chunks.push({
          content: currentChunk.trim(),
          index: chunkIndex++,
        });
        // Keep overlap from end of previous chunk
        const words = currentChunk.split(/\s+/);
        const overlapWords = words.slice(-Math.floor(overlap / 5));
        currentChunk = overlapWords.join(" ") + "\n\n" + trimmedParagraph;
      } else {
        // Paragraph too long, split by sentences
        const sentences = trimmedParagraph.split(/(?<=[.!?])\s+/);
        for (const sentence of sentences) {
          if (currentChunk.length + sentence.length + 1 > maxChunkSize) {
            if (currentChunk) {
              chunks.push({
                content: currentChunk.trim(),
                index: chunkIndex++,
              });
              currentChunk = sentence;
            } else {
              chunks.push({
                content: sentence.slice(0, maxChunkSize),
                index: chunkIndex++,
              });
            }
          } else {
            currentChunk += (currentChunk ? " " : "") + sentence;
          }
        }
      }
    } else {
      currentChunk += (currentChunk ? "\n\n" : "") + trimmedParagraph;
    }
  }

  if (currentChunk.trim()) {
    chunks.push({
      content: currentChunk.trim(),
      index: chunkIndex,
    });
  }

  return chunks;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const voyageApiKey = Deno.env.get("VOYAGE_API_KEY");

    if (!voyageApiKey) {
      throw new Error("VOYAGE_API_KEY not configured");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { itemId, itemIds, organizationId } = await req.json() as ReprocessRequest;

    // Build query based on input
    let query = supabase
      .from("knowledge_items")
      .select("id, title, type, organization_id, metadata")
      .not("metadata->original_content", "is", null);

    if (itemId) {
      query = query.eq("id", itemId);
    } else if (itemIds && itemIds.length > 0) {
      query = query.in("id", itemIds);
    } else if (organizationId) {
      query = query.eq("organization_id", organizationId);
    } else {
      throw new Error("Must provide itemId, itemIds, or organizationId");
    }

    const { data: items, error: fetchError } = await query;

    if (fetchError) throw fetchError;
    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: "No items with original_content found", processed: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const results: { itemId: string; success: boolean; error?: string; chunks?: number }[] = [];

    for (const item of items as KnowledgeItem[]) {
      try {
        const content = item.metadata?.original_content;
        if (!content) {
          results.push({ itemId: item.id, success: false, error: "No original_content in metadata" });
          continue;
        }

        // Update status to processing
        await supabase
          .from("knowledge_items")
          .update({ status: "processing", error_message: null })
          .eq("id", item.id);

        // Delete existing chunks
        await supabase
          .from("knowledge_chunks")
          .delete()
          .eq("item_id", item.id);

        // Chunk the content
        const chunks = chunkContent(content);

        if (chunks.length === 0) {
          await supabase
            .from("knowledge_items")
            .update({ status: "error", error_message: "No content to process" })
            .eq("id", item.id);
          results.push({ itemId: item.id, success: false, error: "No content to process" });
          continue;
        }

        // Prepare texts for batch embedding with title context
        const textsToEmbed = chunks.map((chunk) => `${item.title}\n\n${chunk.content}`);

        // Generate embeddings via Voyage AI
        const embeddingResponse = await fetch("https://api.voyageai.com/v1/embeddings", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${voyageApiKey}`,
          },
          body: JSON.stringify({
            input: textsToEmbed,
            model: "voyage-3", // MUST use voyage-3 for 1024 dimensions (matches DB schema)
            input_type: "document",
          }),
        });

        if (!embeddingResponse.ok) {
          const errorText = await embeddingResponse.text();
          throw new Error(`Voyage API error: ${embeddingResponse.status} - ${errorText}`);
        }

        const embeddingData = await embeddingResponse.json();
        const embeddings = embeddingData.data.map((d: { embedding: number[] }) => d.embedding);

        // CRITICAL: Validate embedding dimensions match DB schema (vector(1024))
        if (embeddings.length > 0 && embeddings[0].length !== 1024) {
          throw new Error(`Embedding dimension mismatch: got ${embeddings[0].length}, expected 1024. Model may have returned wrong dimensions.`);
        }
        console.log(`✅ Generated ${embeddings.length} embeddings (${embeddings[0]?.length || 0} dimensions)`);

        // Insert chunks with embeddings
        const chunkInserts = chunks.map((chunk, idx) => ({
          item_id: item.id,
          organization_id: item.organization_id,
          content: chunk.content,
          chunk_index: chunk.index,
          embedding: JSON.stringify(embeddings[idx]),
          metadata: {
            char_count: chunk.content.length,
            token_estimate: Math.ceil(chunk.content.length / 4),
          },
        }));

        const { error: insertError } = await supabase
          .from("knowledge_chunks")
          .insert(chunkInserts);

        if (insertError) throw insertError;

        // Update item status to published
        await supabase
          .from("knowledge_items")
          .update({
            status: "published",
            error_message: null,
            metadata: {
              ...item.metadata,
              chunk_count: chunks.length,
              reprocessed_at: new Date().toISOString(),
            },
          })
          .eq("id", item.id);

        results.push({ itemId: item.id, success: true, chunks: chunks.length });
      } catch (itemError) {
        console.error(`Error processing item ${item.id}:`, itemError);
        
        // Update item status to error
        await supabase
          .from("knowledge_items")
          .update({
            status: "error",
            error_message: itemError instanceof Error ? itemError.message : "Unknown error",
          })
          .eq("id", item.id);

        results.push({
          itemId: item.id,
          success: false,
          error: itemError instanceof Error ? itemError.message : "Unknown error",
        });
      }
    }

    const successCount = results.filter((r) => r.success).length;
    const totalChunks = results.reduce((sum, r) => sum + (r.chunks || 0), 0);

    return new Response(
      JSON.stringify({
        success: true,
        processed: items.length,
        successful: successCount,
        failed: items.length - successCount,
        totalChunks,
        results,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Reprocess error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
