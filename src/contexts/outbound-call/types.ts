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
  phoneNumberId?: string;
  fromNumber?: string;
}

export interface IncomingCallInfo {
  from: string;
  contactName?: string;
  contactId?: string;
  transferId?: string;
  transferRole?: 'consult';
  initiatorName?: string;
}

export type CallTransferState =
  | 'parking_customer'
  | 'customer_queued'
  | 'consult_ringing'
  | 'consulting'
  | 'returning_to_customer'
  | 'with_customer'
  | 'handoff_pending'
  | 'completed'
  | 'canceled'
  | 'failed';

export interface CallTransferTarget { userId: string; fullName: string; email?: string | null }
export interface CallTransferSession {
  id: string;
  callId: string;
  targetUserId: string;
  targetName: string;
  state: CallTransferState;
  error?: string | null;
}
export interface OutboundNumberOption {
  id: string;
  phoneNumber: string;
  friendlyName: string;
  numberType: 'company' | 'user';
  automatic: boolean;
}
export interface OutboundNumberSelection {
  call: CallInfo;
  options: OutboundNumberOption[];
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
  telephonyV2: boolean;
  incomingCallInfo: IncomingCallInfo | null;
  activeIncomingCallInfo: IncomingCallInfo | null;
  activeIncomingCall: unknown | null;
  isOnIncomingCall: boolean;
  incomingMuted: boolean;
  answerIncomingCall: () => void;
  rejectIncomingCall: () => void;
  endIncomingCall: () => void;
  toggleIncomingMute: () => void;
  activeCallId: string | null;
  canTransferCalls: boolean;
  transferSession: CallTransferSession | null;
  transferTargets: CallTransferTarget[];
  transferLoading: boolean;
  loadTransferTargets: () => Promise<void>;
  startTransfer: (target: CallTransferTarget) => Promise<void>;
  controlTransfer: (action: 'return_to_customer' | 'consult_again' | 'complete' | 'cancel') => Promise<void>;
  numberSelection: OutboundNumberSelection | null;
  selectOutboundNumber: (phoneNumberId: string) => void;
  cancelOutboundNumberSelection: () => void;
}
