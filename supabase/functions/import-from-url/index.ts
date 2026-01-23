import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DOMParser } from "https://deno.land/x/deno_dom@v0.1.38/deno-dom-wasm.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ImportUrlRequest {
  url: string;
  organizationId: string;
  title?: string;
  type: string;
  agentId?: string;
}

function cleanText(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/\n\s*\n/g, "\n\n")
    .trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body: ImportUrlRequest = await req.json();
    const { url, organizationId, title, type, agentId } = body;

    if (!url || !organizationId || !type) {
      return new Response(
        JSON.stringify({ error: "url, organizationId, and type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate URL
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(url);
    } catch {
      return new Response(
        JSON.stringify({ error: "URL inválida" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log(`🌐 Scraping URL: ${url}`);

    // 1. Fetch the HTML
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; KnowledgeBot/1.0)",
        "Accept": "text/html,application/xhtml+xml",
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`);
    }

    const html = await response.text();
    console.log(`📄 Fetched ${html.length} bytes of HTML`);

    // 2. Parse HTML and extract text
    const doc = new DOMParser().parseFromString(html, "text/html");
    if (!doc) {
      throw new Error("Failed to parse HTML");
    }

    // Remove unwanted elements
    const elementsToRemove = [
      "script",
      "style",
      "nav",
      "footer",
      "header",
      "aside",
      "iframe",
      "noscript",
      "svg",
      "form",
      ".cookie-banner",
      ".popup",
      ".modal",
      "#cookie-notice",
      ".advertisement",
      ".ad",
    ];

    for (const selector of elementsToRemove) {
      try {
        const elements = doc.querySelectorAll(selector);
        for (const el of elements) {
          if (el.parentNode) {
            el.parentNode.removeChild(el);
          }
        }
      } catch {
        // Selector might not be valid, skip
      }
    }

    // Get page title if not provided
    let pageTitle = title;
    if (!pageTitle) {
      const titleEl = doc.querySelector("title");
      const h1El = doc.querySelector("h1");
      pageTitle = titleEl?.textContent?.trim() || h1El?.textContent?.trim() || parsedUrl.hostname;
    }

    // Extract main content
    let mainContent = "";
    
    // Try to find main content area
    const mainSelectors = ["main", "article", ".content", ".post-content", "#content", ".entry-content"];
    for (const selector of mainSelectors) {
      const el = doc.querySelector(selector);
      if (el?.textContent && el.textContent.trim().length > 200) {
        mainContent = el.textContent;
        break;
      }
    }

    // Fallback to body
    if (!mainContent) {
      const body = doc.querySelector("body");
      mainContent = body?.textContent || "";
    }

    const cleanContent = cleanText(mainContent);

    if (cleanContent.length < 200) {
      throw new Error(
        "A página não contém texto suficiente para importar. " +
        "Tente uma página com mais conteúdo textual."
      );
    }

    console.log(`📄 Extracted ${cleanContent.length} characters from URL`);

    // 3. Create knowledge_item
    const { data: item, error: itemError } = await supabase
      .from("knowledge_items")
      .insert({
        organization_id: organizationId,
        agent_id: agentId || null,
        title: pageTitle,
        type,
        status: "processing",
        source: "import_url",
        source_url: url,
        metadata: {
          url,
          domain: parsedUrl.hostname,
          scraped_at: new Date().toISOString(),
        },
      })
      .select()
      .single();

    if (itemError || !item) {
      throw new Error(`Failed to create knowledge item: ${itemError?.message}`);
    }

    console.log(`✅ Item created: ${item.id}`);

    // 4. Process the content
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
          content: cleanContent,
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
        title: pageTitle,
        extractedLength: cleanContent.length,
        chunksCreated: processResult.chunksCreated,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error importing from URL:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
