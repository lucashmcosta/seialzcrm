import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplyRequest {
  requestId: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { requestId }: ApplyRequest = await req.json();

    if (!requestId) {
      return new Response(
        JSON.stringify({ error: "requestId is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

    console.log(`📝 Applying edit request: ${requestId}`);

    // Fetch the edit request
    const { data: editRequest, error: fetchError } = await supabase
      .from("knowledge_edit_requests")
      .select("*")
      .eq("id", requestId)
      .single();

    if (fetchError || !editRequest) {
      return new Response(
        JSON.stringify({ error: "Edit request not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate status
    if (editRequest.status !== "pending" && editRequest.status !== "confirmed") {
      return new Response(
        JSON.stringify({ error: `Request already ${editRequest.status}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check expiration
    if (new Date(editRequest.expires_at) < new Date()) {
      await supabase
        .from("knowledge_edit_requests")
        .update({ status: "expired" })
        .eq("id", requestId);

      return new Response(
        JSON.stringify({ error: "Edit request expired" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const proposedChanges = editRequest.proposed_changes as any[];
    const appliedChanges: any[] = [];
    const errors: string[] = [];

    // Apply each change
    for (const change of proposedChanges) {
      try {
        if (change.action === "update" && change.item_id) {
          // Fetch current item
          const { data: currentItem } = await supabase
            .from("knowledge_items")
            .select("*")
            .eq("id", change.item_id)
            .single();

          if (!currentItem) {
            errors.push(`Item ${change.item_id} not found`);
            continue;
          }

          // Save to history
          await supabase.from("knowledge_item_history").insert({
            organization_id: editRequest.organization_id,
            item_id: change.item_id,
            previous_title: currentItem.title,
            previous_content: currentItem.content,
            previous_resolved_content: currentItem.resolved_content,
            new_title: change.proposed_title || currentItem.title,
            new_content: change.proposed_content,
            new_resolved_content: null, // Will be set by trigger
            change_type: "update",
            change_source: "conversation",
            change_description: editRequest.user_request,
            changed_by: userId,
          });

          // Update item (trigger will materialize resolved_content and set needs_reindex=true)
          const updateData: Record<string, any> = {
            content: change.proposed_content,
            updated_by: userId,
          };
          
          if (change.proposed_title) {
            updateData.title = change.proposed_title;
          }
          if (change.category) {
            updateData.category = change.category;
          }

          const { error: updateError } = await supabase
            .from("knowledge_items")
            .update(updateData)
            .eq("id", change.item_id);

          if (updateError) {
            errors.push(`Failed to update ${change.item_id}: ${updateError.message}`);
          } else {
            appliedChanges.push({ ...change, status: "updated" });
          }

        } else if (change.action === "create") {
          // Create new item
          const { data: newItem, error: createError } = await supabase
            .from("knowledge_items")
            .insert({
              organization_id: editRequest.organization_id,
              title: change.proposed_title || "Novo item",
              content: change.proposed_content,
              category: change.category || "geral",
              scope: change.scope || "global",
              product_id: change.product_id || null,
              type: "manual",
              source: "conversation",
              status: "draft",
              created_by: userId,
            })
            .select()
            .single();

          if (createError) {
            errors.push(`Failed to create item: ${createError.message}`);
          } else {
            // Save to history
            await supabase.from("knowledge_item_history").insert({
              organization_id: editRequest.organization_id,
              item_id: newItem.id,
              new_title: newItem.title,
              new_content: newItem.content,
              change_type: "create",
              change_source: "conversation",
              change_description: editRequest.user_request,
              changed_by: userId,
            });

            appliedChanges.push({ ...change, item_id: newItem.id, status: "created" });
          }

        } else if (change.action === "delete" && change.item_id) {
          // Soft delete (mark as inactive)
          const { data: currentItem } = await supabase
            .from("knowledge_items")
            .select("*")
            .eq("id", change.item_id)
            .single();

          if (currentItem) {
            // Save to history
            await supabase.from("knowledge_item_history").insert({
              organization_id: editRequest.organization_id,
              item_id: change.item_id,
              previous_title: currentItem.title,
              previous_content: currentItem.content,
              previous_resolved_content: currentItem.resolved_content,
              change_type: "delete",
              change_source: "conversation",
              change_description: editRequest.user_request,
              changed_by: userId,
            });

            const { error: deleteError } = await supabase
              .from("knowledge_items")
              .update({ is_active: false })
              .eq("id", change.item_id);

            if (deleteError) {
              errors.push(`Failed to delete ${change.item_id}: ${deleteError.message}`);
            } else {
              appliedChanges.push({ ...change, status: "deleted" });
            }
          }
        }
      } catch (changeError) {
        console.error(`Error applying change:`, changeError);
        errors.push(`Error: ${changeError instanceof Error ? changeError.message : "Unknown"}`);
      }
    }

    // Process items that need reindexing
    const { data: dirtyItems } = await supabase
      .from("knowledge_items")
      .select("id")
      .eq("organization_id", editRequest.organization_id)
      .eq("needs_reindex", true)
      .eq("is_active", true);

    console.log(`🔄 Found ${dirtyItems?.length || 0} items needing reindex`);

    // Trigger reprocessing for each dirty item
    for (const item of dirtyItems || []) {
      try {
        await supabase.functions.invoke("process-knowledge-item", {
          body: { itemId: item.id },
        });
        console.log(`✅ Triggered reprocessing for item ${item.id}`);
      } catch (reprocessError) {
        console.error(`Failed to trigger reprocess for ${item.id}:`, reprocessError);
      }
    }

    // Update edit request status
    await supabase
      .from("knowledge_edit_requests")
      .update({
        status: "applied",
        applied_at: new Date().toISOString(),
      })
      .eq("id", requestId);

    console.log(`✅ Applied ${appliedChanges.length} changes, ${errors.length} errors`);

    return new Response(
      JSON.stringify({
        success: errors.length === 0,
        appliedChanges,
        errors,
        reindexedItems: dirtyItems?.length || 0,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error applying knowledge edit:", error);

    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
