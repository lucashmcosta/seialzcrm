// Type-only module. Zero runtime side effects.
// Kept separate so consumers (lazy pages, handlers, modals) can import
// types without pulling in the Twilio SDK or Supabase client, which is
// what created the shared-chunk TDZ when this file's contents lived in
// OutboundCallContext.tsx.

export type CallStatus =
  | 'idle'
  | 'initializing'
  | 'ready'
  | 'connecting'
  | 'ringing'
  | 'connected'
  | 'ended'
  | 'failed';

export interface CallInfo {
  phoneNumber: string;
  contactName?: string;
  contactId?: string;
  opportunityId?: string;
}

export interface TokenCache {
  token: string;
  expires: number;
}

export interface OutboundCallContextType {
  startCall: (params: CallInfo) => void;
  isOnCall: boolean;
  callInfo: CallInfo | null;
  status: CallStatus;
  duration: number;
  errorMessage: string | null;
  endCall: () => void;
  toggleMute: () => void;
  isMuted: boolean;
  sendDTMF: (digit: string) => void;
  dtmfDigits: string;
  isMinimized: boolean;
  setMinimized: (val: boolean) => void;
  isDeviceReady: boolean;
}
