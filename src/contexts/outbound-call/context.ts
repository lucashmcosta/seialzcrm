// Leaf module: createContext token + useOutboundCall hook.
//
// IMPORTANT: This file must NOT import @twilio/voice-sdk, Supabase, or any
// heavy module. Both the eagerly-loaded OutboundCallProvider and every
// lazy-loaded consumer (pages, handlers, modals) import from here, so any
// heavy import would land in a shared chunk and re-create the
// "Cannot access 'X' before initialization" TDZ we are fixing.

import { createContext, useContext } from 'react';
import type { OutboundCallContextType } from './types';

export const OutboundCallContext = createContext<OutboundCallContextType | undefined>(undefined);

export function useOutboundCall() {
  const context = useContext(OutboundCallContext);
  if (context === undefined) {
    throw new Error('useOutboundCall must be used within an OutboundCallProvider');
  }
  return context;
}

export type { CallStatus, CallInfo, OutboundCallContextType } from './types';
