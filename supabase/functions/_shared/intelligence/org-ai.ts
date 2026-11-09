// IA de texto das telas de conhecimento e feedback. Exige usuário membro da org e usa só a
// chave da própria org: sem chave, a função recusa em vez de cair em IA paga pelo Seialz.
import { createClient } from "jsr:@supabase/supabase-js@2";
import { decryptSecret } from "../crypto.ts";
import { currentAiModel } from "./agent-ai-credential.ts";
import { logAiUsage } from "./log-usage.ts";
import { estimateTextCostUsd } from "./pricing.ts";
import { byokBudgetExceeded, markByokInvalid, readSecretPayload } from "./resolve-provider.ts";
import { pickTextAiCredential } from "./text-ai-credential.ts";

export interface ChatMessage { role: string; content: string }
export type OrgAiChat = (messages: ChatMessage[], opts?: { maxTokens?: number }) => Promise<string>;
export interface ChatTarget { provider: "anthropic" | "openai"; apiKey: string; model: string }
export interface ChatResult { text: string; promptTokens: number; completionTokens: number }

type OrgAiCode = "no_ai_key" | "budget_exceeded" | "key_rejected" | "rate_limited" | "ai_failure";

const ERROR_RESPONSE: Record<OrgAiCode, { status: number; message: string }> = {
  no_ai_key: { status: 409, message: "Cadastre uma chave do Claude ou da OpenAI em Configurações > Provedores de IA." },
  budget_exceeded: { status: 402, message: "O limite mensal da chave de IA desta organização foi atingido." },
  key_rejected: { status: 424, message: "A chave de IA desta organização foi recusada. Confira a chave cadastrada." },
  rate_limited: { status: 429, message: "A IA está com muitas requisições. Aguarde um momento e tente novamente." },
  ai_failure: { status: 502, message: "A IA não respondeu. Tente novamente." },
};

export class OrgAiError extends Error {
  constructor(public code: OrgAiCode) {
    super(code);
    this.name = "OrgAiError";
  }
}

export function orgAiErrorResponse(e: OrgAiError, cors: Record<string, string>): Response {
  const { status, message } = ERROR_RESPONSE[e.code];
  return new Response(JSON.stringify({ error: message, code: e.code }), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

/** Sem temperatura: alguns modelos atuais recusam o parâmetro, e o padrão serve aqui. */
export function buildChatRequest(
  target: ChatTarget,
  messages: ChatMessage[],
  maxTokens: number,
): { url: string; headers: Record<string, string>; body: Record<string, unknown> } {
  if (target.provider === "anthropic") {
    const system = messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: { "x-api-key": target.apiKey, "anthropic-version": "2023-06-01", "Content-Type": "application/json" },
      body: {
        model: target.model,
        max_tokens: maxTokens,
        ...(system ? { system } : {}),
        messages: messages.filter((m) => m.role !== "system"),
      },
    };
  }
  return {
    url: "https://api.openai.com/v1/chat/completions",
    headers: { Authorization: `Bearer ${target.apiKey}`, "Content-Type": "application/json" },
    body: { model: target.model, max_completion_tokens: maxTokens, messages },
  };
}

export function parseChatResponse(provider: ChatTarget["provider"], data: any): ChatResult {
  if (provider === "anthropic") {
    const text = (data?.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
    return { text, promptTokens: data?.usage?.input_tokens ?? 0, completionTokens: data?.usage?.output_tokens ?? 0 };
  }
  return {
    text: data?.choices?.[0]?.message?.content ?? "",
    promptTokens: data?.usage?.prompt_tokens ?? 0,
    completionTokens: data?.usage?.completion_tokens ?? 0,
  };
}

export async function callChatTarget(target: ChatTarget, messages: ChatMessage[], maxTokens: number): Promise<ChatResult> {
  const request = buildChatRequest(target, messages, maxTokens);
  const response = await fetch(request.url, { method: "POST", headers: request.headers, body: JSON.stringify(request.body) });
  if (!response.ok) {
    console.error("[org-ai] provider error", target.provider, response.status);
    if (response.status === 401 || response.status === 403) throw new OrgAiError("key_rejected");
    if (response.status === 429) throw new OrgAiError("rate_limited");
    throw new OrgAiError("ai_failure");
  }
  return parseChatResponse(target.provider, await response.json());
}

type OrgAiGate =
  | { ok: true; ai: OrgAiChat; admin: any; userId: string }
  | { ok: false; response: Response };

export async function openOrgAi(
  req: Request,
  organizationId: unknown,
  action: string,
  cors: Record<string, string>,
): Promise<OrgAiGate> {
  const refuse = (error: string, status: number): OrgAiGate => ({
    ok: false,
    response: new Response(JSON.stringify({ error }), { status, headers: { ...cors, "Content-Type": "application/json" } }),
  });
  const orgId = typeof organizationId === "string" ? organizationId : "";
  if (!orgId) return refuse("missing_organization_id", 400);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return refuse("Unauthorized", 401);
  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { data: auth, error: authError } = await admin.auth.getUser(authHeader.slice("Bearer ".length));
  if (authError || !auth?.user) return refuse("Unauthorized", 401);
  const { data: user } = await admin.from("users").select("id").eq("auth_user_id", auth.user.id).maybeSingle();
  if (!user) return refuse("user_not_found", 403);
  const { data: member } = await admin.from("user_organizations").select("id")
    .eq("user_id", user.id).eq("organization_id", orgId).eq("is_active", true).maybeSingle();
  if (!member) return refuse("forbidden_org", 403);

  const { data: rows } = await admin.from("organization_integrations")
    .select("config_values, integration:admin_integrations!inner(slug)")
    .eq("organization_id", orgId).eq("is_enabled", true)
    .in("integration.slug", ["claude-ai", "openai-gpt"]);
  const legacyRows = (rows ?? []).map((r: any) => ({ slug: r.integration.slug, config_values: r.config_values }));
  const credential = pickTextAiCredential(await readSecretPayload(admin, orgId) as any, legacyRows);
  if (!credential) return { ok: false, response: orgAiErrorResponse(new OrgAiError("no_ai_key"), cors) };

  const provider = credential.slug === "claude-ai" ? "anthropic" : "openai";
  const fallbackModel = provider === "anthropic" ? "claude-sonnet-5-5" : "gpt-4o-mini";
  let apiKey: string;
  let chosenModel: string | null | undefined;
  if (credential.kind === "byok") {
    const budget = Number(credential.entry.monthly_budget_usd ?? 0);
    if (budget > 0 && await byokBudgetExceeded(admin, orgId, provider, budget)) {
      return { ok: false, response: orgAiErrorResponse(new OrgAiError("budget_exceeded"), cors) };
    }
    apiKey = await decryptSecret(credential.entry.api_key_encrypted!);
    chosenModel = credential.entry.preferred_model;
  } else {
    apiKey = credential.config.api_key;
    chosenModel = credential.config.default_model;
  }
  const target: ChatTarget = { provider, apiKey, model: currentAiModel(chosenModel) || fallbackModel };

  const ai: OrgAiChat = async (messages, opts) => {
    let result: ChatResult;
    try {
      result = await callChatTarget(target, messages, opts?.maxTokens ?? 4096);
    } catch (e) {
      if (credential.kind === "byok" && e instanceof OrgAiError && e.code === "key_rejected") {
        await markByokInvalid(admin, orgId, provider, "invalid_key");
      }
      throw e;
    }
    if (credential.kind === "byok") {
      await logAiUsage(admin, {
        organization_id: orgId,
        user_id: user.id,
        provider,
        model: target.model,
        source: "customer_key",
        action,
        integration_slug: credential.slug,
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.promptTokens + result.completionTokens,
        estimated_cost_usd: await estimateTextCostUsd(admin, provider, target.model, result.promptTokens, result.completionTokens),
      });
    } else {
      await admin.from("ai_usage_logs").insert({
        organization_id: orgId,
        user_id: user.id,
        integration_slug: credential.slug,
        model_used: target.model,
        action,
        prompt_tokens: result.promptTokens,
        completion_tokens: result.completionTokens,
        total_tokens: result.promptTokens + result.completionTokens,
      });
    }
    return result.text;
  };
  return { ok: true, ai, admin, userId: user.id };
}
