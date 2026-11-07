// Parser do evento `WA_EMBEDDED_SIGNUP` que o popup do Embedded Signup (v4) envia
// por postMessage para a janela que abriu o fluxo. Sem dependências — testável.

export interface EmbeddedSignupSession {
  event: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  businessId: string | null;
  /** Tela onde o usuário abandonou (event = CANCEL). */
  currentStep: string | null;
  errorMessage: string | null;
}

/** Só aceita mensagens de facebook.com ou subdomínios (nunca `evilfacebook.com`). */
export function isFacebookOrigin(origin: string): boolean {
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === 'https:' && (hostname === 'facebook.com' || hostname.endsWith('.facebook.com'));
  } catch {
    return false;
  }
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null);

export function parseEmbeddedSignupMessage(origin: string, raw: unknown): EmbeddedSignupSession | null {
  if (!isFacebookOrigin(origin)) return null;
  let payload: unknown = raw;
  if (typeof raw === 'string') {
    try {
      payload = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  const p = payload as { type?: unknown; event?: unknown; data?: Record<string, unknown> } | null;
  if (!p || p.type !== 'WA_EMBEDDED_SIGNUP') return null;
  const d = p.data ?? {};
  return {
    event: str(p.event) ?? 'UNKNOWN',
    wabaId: str(d.waba_id),
    phoneNumberId: str(d.phone_number_id),
    businessId: str(d.business_id),
    currentStep: str(d.current_step),
    errorMessage: str(d.error_message),
  };
}
