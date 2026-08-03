export type VoiceProvider = "twilio";

export interface VoiceSession {
  provider: VoiceProvider;
  token: string;
  identity: string;
  expiresAt: string;
}

export interface VoiceProviderAdapter {
  readonly provider: VoiceProvider;
  issueSession(input: {
    organizationId: string;
    userId: string;
  }): Promise<VoiceSession>;
  connectionParams(input: {
    to: string;
    callId: string;
    phoneNumberId: string;
  }): Record<string, string>;
  verifyWebhook(input: {
    request: Request;
    params: Record<string, string>;
    organizationId: string;
  }): Promise<boolean>;
  normalizeStatus(status: string | null | undefined): string;
  recordingMediaUrl(providerUrl: string): string;
}

export interface TelephonyCallIntentRequest {
  to: string;
  contactId?: string;
  opportunityId?: string;
  phoneNumberId?: string;
}
