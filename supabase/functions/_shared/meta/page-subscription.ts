// Assinatura da Página no webhook do app (subscribed_apps). É ela que faz a Meta entregar
// as mensagens do Messenger e do Instagram ligado à Página. Pode repetir sem efeito novo.
import { metaGraphGet, metaGraphPost } from "../meta-graph.ts";

export const PAGE_WEBHOOK_FIELDS = ["feed", "mention", "messages", "messaging_postbacks", "message_reactions"];

/** Campos a gravar, sem perder os que já existem. null: já está tudo assinado. */
export function fieldsToSubscribe(current: string[]): string[] | null {
  const missing = PAGE_WEBHOOK_FIELDS.filter((f) => !current.includes(f));
  return missing.length ? [...current, ...missing] : null;
}

export async function ensurePageSubscribed(
  pageId: string,
  opts: { pageToken: string; appId?: string; appSecret?: string },
): Promise<"already" | "subscribed"> {
  const call = { accessToken: opts.pageToken, appSecret: opts.appSecret };
  const r = await metaGraphGet(`/${pageId}/subscribed_apps`, { fields: "id,subscribed_fields" }, call);
  // A Página pode ter outros apps assinados: só os campos do nosso contam.
  const ours = (r?.data ?? []).find((a: any) => String(a?.id) === String(opts.appId));
  const fields = fieldsToSubscribe(ours?.subscribed_fields ?? []);
  if (!fields) return "already";
  await metaGraphPost(`/${pageId}/subscribed_apps`, { subscribed_fields: fields.join(",") }, call);
  return "subscribed";
}
