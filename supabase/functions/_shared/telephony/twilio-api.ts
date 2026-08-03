import { loadTwilioVoiceConfig } from "./twilio.ts";

export interface TwilioApiContext {
  accountSid: string;
  authToken: string;
  twimlAppSid: string;
  integrationId: string;
}

// deno-lint-ignore no-explicit-any
export async function twilioApiContext(
  admin: any,
  organizationId: string,
): Promise<TwilioApiContext> {
  return await loadTwilioVoiceConfig(admin, organizationId);
}

function twilioHeaders(context: TwilioApiContext, form = false): HeadersInit {
  return {
    Authorization: `Basic ${
      btoa(`${context.accountSid}:${context.authToken}`)
    }`,
    ...(form ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
  };
}

export async function twilioRequest<T>(
  context: TwilioApiContext,
  url: string,
  options: {
    method?: "GET" | "POST" | "DELETE";
    form?: Record<string, string | number | boolean | null | undefined>;
  } = {},
): Promise<T> {
  const body = options.form
    ? new URLSearchParams(
      Object.entries(options.form)
        .filter(([, value]) => value !== undefined && value !== null)
        .map(([key, value]) => [key, String(value)]),
    ).toString()
    : undefined;
  const response = await fetch(url, {
    method: options.method ?? "GET",
    headers: twilioHeaders(context, !!options.form),
    body,
  });
  if (!response.ok) {
    const detail = await response.text();
    const error = new Error(`twilio_api_error:${response.status}`) as Error & {
      status?: number;
      detail?: string;
    };
    error.status = response.status;
    error.detail = detail.slice(0, 2000);
    throw error;
  }
  if (response.status === 204) return undefined as T;
  return await response.json() as T;
}

export function twilioAccountUrl(
  context: TwilioApiContext,
  path: string,
): string {
  return `https://api.twilio.com/2010-04-01/Accounts/${context.accountSid}/${
    path.replace(/^\//, "")
  }`;
}

export async function updateTwilioCall(
  context: TwilioApiContext,
  callSid: string,
  input: { url?: string; twiml?: string; status?: "completed" },
): Promise<void> {
  await twilioRequest(
    context,
    twilioAccountUrl(context, `Calls/${encodeURIComponent(callSid)}.json`),
    {
      method: "POST",
      form: {
        Url: input.url,
        Method: input.url ? "POST" : undefined,
        Twiml: input.twiml,
        Status: input.status,
      },
    },
  );
}

export async function createTwilioQueue(
  context: TwilioApiContext,
  friendlyName: string,
): Promise<{ sid: string; friendly_name: string }> {
  return await twilioRequest(
    context,
    twilioAccountUrl(context, "Queues.json"),
    { method: "POST", form: { FriendlyName: friendlyName, MaxSize: 1 } },
  );
}

export async function deleteTwilioQueue(
  context: TwilioApiContext,
  queueSid: string | null | undefined,
): Promise<void> {
  if (!queueSid) return;
  await twilioRequest(
    context,
    twilioAccountUrl(context, `Queues/${encodeURIComponent(queueSid)}.json`),
    { method: "DELETE" },
  );
}

export function safeTwilioError(
  error: unknown,
): { code: string; detail?: string } {
  if (error instanceof Error) {
    const value = error as Error & { detail?: string };
    let detail: string | undefined;
    try {
      const parsed = JSON.parse(value.detail || "{}") as {
        code?: number;
        message?: string;
      };
      detail = parsed.message || value.message;
      return {
        code: parsed.code ? `twilio_${parsed.code}` : value.message,
        detail,
      };
    } catch {
      return { code: value.message, detail: value.detail };
    }
  }
  return { code: "twilio_unknown_error" };
}
