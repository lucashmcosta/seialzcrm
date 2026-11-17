// "Digitando..." no WhatsApp enquanto o agente de IA monta a resposta.
//
// Sem nenhum sinal, o cliente manda outra mensagem uns 20 s depois, bem quando a resposta
// sai, e as duas se cruzam. A Meta mostra o "digitando..." por até 25 s ou até a próxima
// mensagem nossa, e marca a mensagem do cliente como lida (é o mesmo pedido).
// Só existe na Meta Cloud API. Nos outros provedores não faz nada.

import { resolveMetaCredentials } from "./credentials.ts";
import { metaWaPostJson } from "./graph.ts";

type SupabaseLike = { from: (table: string) => any };

export function typingIndicatorBody(wamid: string) {
  return {
    messaging_product: "whatsapp",
    status: "read",
    message_id: wamid,
    typing_indicator: { type: "text" },
  };
}

/** Mostra o "digitando..." para a última mensagem do cliente na conversa. Nunca lança erro. */
export async function showTypingIndicator(supabase: SupabaseLike, threadId: string): Promise<boolean> {
  try {
    const { data: inbound } = await supabase.from("messages")
      .select("whatsapp_message_sid, endpoint_id")
      .eq("thread_id", threadId).eq("direction", "inbound").is("deleted_at", null)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    const wamid = inbound?.whatsapp_message_sid as string | null | undefined;
    if (!wamid?.startsWith("wamid.") || !inbound?.endpoint_id) return false;

    const { data: endpoint } = await supabase.from("communication_endpoints")
      .select("provider, sender_sid, organization_integration_id")
      .eq("id", inbound.endpoint_id).maybeSingle();
    if (endpoint?.provider !== "meta_cloud_api" || !endpoint.sender_sid || !endpoint.organization_integration_id) return false;

    const creds = await resolveMetaCredentials(supabase, endpoint.organization_integration_id);
    await metaWaPostJson(`/${endpoint.sender_sid}/messages`, typingIndicatorBody(wamid), {
      accessToken: creds.accessToken,
      appSecret: creds.appSecret,
    });
    return true;
  } catch (e) {
    console.warn("[typing] não mostrou o digitando", (e as Error).message);
    return false;
  }
}
