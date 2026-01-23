import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function getSourceType(mimeType: string, fileName: string): string {
  if (mimeType === "text/plain" || fileName.endsWith(".txt")) return "import_txt";
  if (mimeType === "text/markdown" || fileName.endsWith(".md")) return "import_md";
  if (mimeType === "application/pdf" || fileName.endsWith(".pdf")) return "import_pdf";
  if (mimeType.includes("wordprocessingml") || fileName.endsWith(".docx")) return "import_docx";
  return "import_txt";
}

async function extractTextFromPDF(arrayBuffer: ArrayBuffer): Promise<string> {
  // Simple PDF text extraction - looks for text streams
  const bytes = new Uint8Array(arrayBuffer);
  const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  
  // Extract text between stream markers (simplified approach)
  const textParts: string[] = [];
  const streamRegex = /stream[\r\n]+([\s\S]*?)[\r\n]+endstream/g;
  let match;
  
  while ((match = streamRegex.exec(text)) !== null) {
    const streamContent = match[1];
    // Look for text showing operators (Tj, TJ, ')
    const textMatches = streamContent.match(/\(([^)]+)\)\s*Tj/g);
    if (textMatches) {
      for (const tm of textMatches) {
        const extracted = tm.replace(/\(([^)]+)\)\s*Tj/, "$1");
        if (extracted && extracted.length > 0) {
          textParts.push(extracted);
        }
      }
    }
  }
  
  // Also try to find raw text content
  const rawTextRegex = /\/Contents\s*\(([^)]+)\)/g;
  while ((match = rawTextRegex.exec(text)) !== null) {
    textParts.push(match[1]);
  }
  
  // Fallback: extract any readable ASCII sequences
  if (textParts.length === 0) {
    const readableRegex = /[A-Za-z0-9\s.,!?;:'"()-]{20,}/g;
    const readable = text.match(readableRegex);
    if (readable) {
      textParts.push(...readable);
    }
  }
  
  return textParts.join(" ").replace(/\s+/g, " ").trim();
}

async function extractTextFromDOCX(arrayBuffer: ArrayBuffer): Promise<string> {
  // DOCX is a ZIP file containing XML
  // We'll use a simple approach to extract text from document.xml
  try {
    const bytes = new Uint8Array(arrayBuffer);
    const text = new TextDecoder("utf-8", { fatal: false }).decode(bytes);
    
    // Look for text content in the XML
    const textRegex = /<w:t[^>]*>([^<]+)<\/w:t>/g;
    const textParts: string[] = [];
    let match;
    
    while ((match = textRegex.exec(text)) !== null) {
      textParts.push(match[1]);
    }
    
    if (textParts.length > 0) {
      return textParts.join(" ").replace(/\s+/g, " ").trim();
    }
    
    // Fallback: extract readable content
    const readableRegex = /[A-Za-z0-9\s.,!?;:'"()-]{10,}/g;
    const readable = text.match(readableRegex);
    return readable ? readable.join(" ").replace(/\s+/g, " ").trim() : "";
  } catch (error) {
    console.error("Error extracting DOCX text:", error);
    return "";
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const organizationId = formData.get("organizationId") as string;
    const title = formData.get("title") as string;
    const type = formData.get("type") as string;
    const agentId = formData.get("agentId") as string | null;

    if (!file || !organizationId || !type) {
      return new Response(
        JSON.stringify({ error: "file, organizationId, and type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`📤 Importing file: ${file.name} (${file.type}, ${file.size} bytes)`);

    // 1. Upload to storage
    const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
    const storagePath = `${organizationId}/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from("knowledge-uploads")
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      throw new Error(`Failed to upload file: ${uploadError.message}`);
    }

    console.log(`✅ File uploaded to: ${storagePath}`);

    // 2. Create knowledge_item with status 'processing'
    const { data: item, error: itemError } = await supabase
      .from("knowledge_items")
      .insert({
        organization_id: organizationId,
        agent_id: agentId || null,
        title: title || file.name.replace(/\.[^/.]+$/, ""),
        type,
        status: "processing",
        source: getSourceType(file.type, file.name),
        source_file_path: storagePath,
        metadata: {
          file_name: file.name,
          file_size: file.size,
          file_type: file.type,
        },
      })
      .select()
      .single();

    if (itemError || !item) {
      console.error("Error creating item:", itemError);
      throw new Error(`Failed to create knowledge item: ${itemError?.message}`);
    }

    console.log(`✅ Item created: ${item.id}`);

    // 3. Extract text based on file type
    let extractedText = "";
    const arrayBuffer = await file.arrayBuffer();

    try {
      if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        extractedText = await file.text();
      } else if (file.type === "text/markdown" || file.name.endsWith(".md")) {
        extractedText = await file.text();
      } else if (file.type === "application/pdf" || file.name.endsWith(".pdf")) {
        extractedText = await extractTextFromPDF(arrayBuffer);
        
        // Validate PDF has text
        if (extractedText.trim().length < 100) {
          throw new Error(
            "PDF parece ser uma imagem escaneada ou não contém texto selecionável. " +
            "Por favor, converta para PDF com texto ou use TXT/DOCX."
          );
        }
      } else if (
        file.type.includes("wordprocessingml") ||
        file.name.endsWith(".docx")
      ) {
        extractedText = await extractTextFromDOCX(arrayBuffer);
        
        if (extractedText.trim().length < 50) {
          throw new Error(
            "Não foi possível extrair texto do DOCX. " +
            "Tente salvar como TXT ou copie o conteúdo manualmente."
          );
        }
      } else {
        // Try to read as text
        extractedText = new TextDecoder("utf-8", { fatal: false }).decode(
          new Uint8Array(arrayBuffer)
        );
      }

      console.log(`📄 Extracted ${extractedText.length} characters`);

      if (extractedText.trim().length < 50) {
        throw new Error("Arquivo não contém texto suficiente para processar.");
      }
    } catch (extractError) {
      // Mark item as error
      await supabase
        .from("knowledge_items")
        .update({
          status: "error",
          error_message: extractError instanceof Error ? extractError.message : "Extraction failed",
        })
        .eq("id", item.id);

      throw extractError;
    }

    // 4. Call process-knowledge to chunk and generate embeddings
    const processResponse = await fetch(
      `${supabaseUrl}/functions/v1/process-knowledge`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${supabaseKey}`,
        },
        body: JSON.stringify({
          itemId: item.id,
          content: extractedText,
        }),
      }
    );

    if (!processResponse.ok) {
      const errorText = await processResponse.text();
      console.error("Process-knowledge error:", errorText);
      throw new Error(`Failed to process knowledge: ${errorText}`);
    }

    const processResult = await processResponse.json();

    return new Response(
      JSON.stringify({
        success: true,
        itemId: item.id,
        extractedLength: extractedText.length,
        chunksCreated: processResult.chunksCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error importing knowledge:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
