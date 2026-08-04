import React, { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { Device as TwilioDevice, Call as TwilioCall } from '@twilio/voice-sdk';
import { supabase } from '@/integrations/supabase/client';
import { telephonySupabase } from '@/integrations/supabase/telephonyClient';
import { toast } from 'sonner';
import { getTelephonySession, getTwilioAccessToken, getVerifiedSession } from '@/lib/authSession';
import { useOrganization } from '@/hooks/useOrganization';
import { useTelephonyV2Flag } from '@/hooks/useTelephonyV2Flag';
import { usePermissions } from '@/hooks/usePermissions';

import { OutboundCallContext } from './outbound-call/context';
import type { CallInfo, CallStatus, IncomingCallInfo, OutboundCallContextType, TokenCache, CallTransferSession, CallTransferTarget, CallTransferState, OutboundNumberSelection } from './outbound-call/types';

// Re-export public API so existing import paths
// (`@/contexts/OutboundCallContext`) keep working unchanged.
export { useOutboundCall } from './outbound-call/context';
export type { CallStatus, CallInfo } from './outbound-call/types';

function expectedTwilioIdentity(userId: string, organizationId: string) {
  return `user_${userId.replace(/[^A-Za-z0-9]/g, '')}_org_${organizationId.replace(/[^A-Za-z0-9]/g, '')}`;
}

export function TelephonyProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { organization, userProfile } = useOrganization();
  const { permissions, loading: permissionsLoading } = usePermissions();
  const { enabled: telephonyV2, loading: telephonyFlagLoading } = useTelephonyV2Flag(organization?.id);
  const [isVoiceLeader, setIsVoiceLeader] = useState(false);
  const [hasVoiceIntegration, setHasVoiceIntegration] = useState(false);
  const [voiceLoading, setVoiceLoading] = useState(true);
  const [status, setStatus] = useState<CallStatus>('idle');
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [dtmfDigits, setDtmfDigits] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  const [isDeviceReady, setIsDeviceReady] = useState(false);
  const [incomingCallInfo, setIncomingCallInfo] = useState<IncomingCallInfo | null>(null);
  const [activeIncomingCallInfo, setActiveIncomingCallInfo] = useState<IncomingCallInfo | null>(null);
  const [activeIncomingCall, setActiveIncomingCall] = useState<TwilioCall | null>(null);
  const [incomingMuted, setIncomingMuted] = useState(false);
  const [activeCallId, setActiveCallId] = useState<string | null>(null);
  const [transferSession, setTransferSession] = useState<CallTransferSession | null>(null);
  const [transferTargets, setTransferTargets] = useState<CallTransferTarget[]>([]);
  const [transferLoading, setTransferLoading] = useState(false);
  const [numberSelection, setNumberSelection] = useState<OutboundNumberSelection | null>(null);

  // SECURITY: Never initialize in admin routes
  const isAdminRoute = location.pathname.startsWith('/admin');

  const deviceRef = useRef<TwilioDevice | null>(null);
  const activeCallRef = useRef<TwilioCall | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<Date | null>(null);
  const pendingCallRef = useRef<CallInfo | null>(null);
  const tokenCacheRef = useRef<TokenCache | null>(null);
  const userDataCacheRef = useRef<{ userId: string; orgId: string } | null>(null);
  const isInitializingRef = useRef(false);
  const stateTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Track which status source arrived first to avoid duplicates
  const lastProcessedStatusRef = useRef<string | null>(null);
  // Track if call has reached a final state to reject stale events
  const callFinalizedRef = useRef(false);
  const initTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const realtimeCleanupTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cleanupCallRef = useRef<(() => void) | null>(null);
  const incomingCallRef = useRef<TwilioCall | null>(null);
  const presenceTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const presenceActiveCallRef = useRef<string | null>(null);
  const deviceRegisteredRef = useRef(false);
  // A fresh ID per mounted tab avoids duplicated tabs sharing the same lease.
  const presenceSessionRef = useRef<string>(crypto.randomUUID());
  const transferCallRef = useRef<TwilioCall | null>(null);
  const transferSessionRef = useRef<CallTransferSession | null>(null);
  const numberSelectionRef = useRef<OutboundNumberSelection | null>(null);
  const outboundSelectionRequestRef = useRef(0);
  const transferChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const suppressCallFinalizationRef = useRef(false);
  const transferOriginRef = useRef<'incoming' | 'outgoing'>('outgoing');

  const isOnCall = status !== 'idle' && status !== 'failed' && status !== 'ended';
  const isOnIncomingCall = activeIncomingCall !== null;
  const canUseVoiceDevice = !telephonyV2 || permissions.canMakeCalls || permissions.canReceiveCalls;
  const canTransferCalls = telephonyV2 && permissions.canTransferCalls;

  useEffect(() => { transferSessionRef.current = transferSession; }, [transferSession]);

  useEffect(() => {
    if (!telephonyV2) {
      setIsVoiceLeader(true);
      return;
    }
    if (!organization?.id || isAdminRoute) {
      setIsVoiceLeader(false);
      return;
    }
    const key = `__seialz_voice_leader_${organization.id}`;
    const tabId = presenceSessionRef.current;
    const claim = () => {
      const now = Date.now();
      let current: { tabId?: string; expiresAt?: number } = {};
      try { current = JSON.parse(window.localStorage.getItem(key) || '{}'); } catch { /* Ignore a malformed stale lease. */ }
      if (!current.tabId || current.tabId === tabId || Number(current.expiresAt) <= now) {
        window.localStorage.setItem(key, JSON.stringify({ tabId, expiresAt: now + 15_000 }));
        setIsVoiceLeader(true);
      } else {
        setIsVoiceLeader(false);
      }
    };
    claim();
    const timer = setInterval(claim, 5_000);
    return () => {
      clearInterval(timer);
      try {
        const current = JSON.parse(window.localStorage.getItem(key) || '{}');
        if (current.tabId === tabId) window.localStorage.removeItem(key);
      } catch { /* Ignore a malformed stale lease. */ }
      setIsVoiceLeader(false);
    };
  }, [telephonyV2, organization?.id, isAdminRoute]);

  // Clear any pending state timeout
  const clearStateTimeout = useCallback(() => {
    if (stateTimeoutRef.current) {
      clearTimeout(stateTimeoutRef.current);
      stateTimeoutRef.current = null;
    }
  }, []);

  // Set a timeout that forces cleanup if a state hangs
  const setStateTimeout = useCallback((timeoutMs: number, failMessage: string) => {
    clearStateTimeout();
    stateTimeoutRef.current = setTimeout(() => {
      console.warn(`[OutboundCall] State timeout: ${failMessage}`);
      if (activeCallRef.current) {
        try { activeCallRef.current.disconnect(); } catch {}
        activeCallRef.current = null;
      }
      setErrorMessage(failMessage);
      setStatus('failed');
      updateCallRecord('failed', new Date());
    }, timeoutMs);
  }, [clearStateTimeout]);

  // Map server status (from webhook) to frontend CallStatus
  const mapServerStatus = useCallback((serverStatus: string): CallStatus | null => {
    switch (serverStatus) {
      case 'queued': return 'connecting';
      case 'ringing': return 'ringing';
      case 'in-progress': return 'connected';
      case 'completed':
      case 'canceled':
      case 'no-answer': return 'ended';
      case 'busy':
      case 'failed': return 'failed';
      default: return null;
    }
  }, []);

  // Subscribe to call status changes via Supabase Realtime
  const subscribeToCallStatus = useCallback((callId: string) => {
    // Cleanup previous subscription
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }

    const channel = supabase
      .channel(`call-status-${callId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'calls',
          filter: `id=eq.${callId}`,
        },
        (payload) => {
          const newRecord = payload.new as Record<string, any>;
          const serverStatus = newRecord.status;

          console.log(`[Realtime] Call status from server: ${serverStatus}`);

          // Skip if we already processed this status from SDK events
          if (lastProcessedStatusRef.current === serverStatus) {
            return;
          }
          lastProcessedStatusRef.current = serverStatus;

          const mappedStatus = mapServerStatus(serverStatus);
          if (!mappedStatus) return;

          // Server says call ended/failed — trust it and force cleanup
          if (mappedStatus === 'ended' || mappedStatus === 'failed') {
            callFinalizedRef.current = true;
            clearStateTimeout();
            setStatus(mappedStatus);
            if (serverStatus === 'busy') {
              setErrorMessage('Linha ocupada');
            } else if (serverStatus === 'no-answer') {
              setErrorMessage('Chamada não atendida');
            }
            // Auto-cleanup after showing final state (tracked timeout)
            if (realtimeCleanupTimeoutRef.current) clearTimeout(realtimeCleanupTimeoutRef.current);
            realtimeCleanupTimeoutRef.current = setTimeout(() => {
              if (activeCallRef.current) {
                try { activeCallRef.current.disconnect(); } catch {}
                activeCallRef.current = null;
              }
              cleanupCallRef.current?.();
            }, 2000);
            return;
          }

          // Server says connected — update if we haven't already
          if (mappedStatus === 'connected') {
            clearStateTimeout();
            setStatus('connected');
            toast.success('Chamada conectada');
          } else if (mappedStatus === 'ringing') {
            clearStateTimeout();
            setStatus('ringing');
            // Extend timeout for ringing
            setStateTimeout(60000, 'Chamada não atendida');
          }
        }
      )
      .subscribe();

    realtimeChannelRef.current = channel;
  }, [mapServerStatus, clearStateTimeout, setStateTimeout]);

  // Unsubscribe from Realtime
  const unsubscribeFromCallStatus = useCallback(() => {
    if (realtimeChannelRef.current) {
      supabase.removeChannel(realtimeChannelRef.current);
      realtimeChannelRef.current = null;
    }
    lastProcessedStatusRef.current = null;
  }, []);

  // Get cached token or fetch new one
  const getToken = useCallback(async (): Promise<string> => {
    const now = Date.now();

    // Return cached token if still valid (with 1 minute buffer)
    if (tokenCacheRef.current && tokenCacheRef.current.expires > now + 60000) {
      console.log('Using cached token');
      return tokenCacheRef.current.token;
    }

    const token = telephonyV2
      ? (organization?.id ? (await getTelephonySession(organization.id))?.token ?? null : null)
      : await getTwilioAccessToken();

    if (!token) {
      throw new Error('Sessão expirada. Faça login novamente.');
    }

    // Cache token for 1 hour
    tokenCacheRef.current = {
      token,
      expires: now + 3600000, // 1 hour
    };

    console.log('Token fetched and cached');
    return token;
  }, [telephonyV2, organization?.id]);

  // Get cached user data or fetch it
  const getUserData = useCallback(async () => {
    if (userDataCacheRef.current) {
      return userDataCacheRef.current;
    }

    const { data } = await supabase.auth.getUser();
    if (data.user && organization?.id && userProfile?.id) {
      userDataCacheRef.current = {
        userId: userProfile.id,
        orgId: organization.id,
      };
      return userDataCacheRef.current;
    }

    return null;
  }, [organization?.id, userProfile?.id]);

  const updatePresence = useCallback(async (activeCallId: string | null = null) => {
    if (!telephonyV2 || !deviceRegisteredRef.current || !isVoiceLeader || !organization?.id || !userProfile?.id || isAdminRoute) return;
    presenceActiveCallRef.current = activeCallId;
    await telephonySupabase.from('telephony_presence').upsert({
      organization_id: organization.id,
      user_id: userProfile.id,
      session_id: presenceSessionRef.current,
      status: 'available',
      active_call_id: activeCallId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,user_id,session_id' });
  }, [telephonyV2, isVoiceLeader, organization?.id, userProfile?.id, isAdminRoute]);

  const startPresenceHeartbeat = useCallback(() => {
    if (!telephonyV2) return;
    if (presenceTimerRef.current) clearInterval(presenceTimerRef.current);
    void updatePresence(presenceActiveCallRef.current);
    presenceTimerRef.current = setInterval(() => void updatePresence(presenceActiveCallRef.current), 30_000);
  }, [telephonyV2, updatePresence]);

  const removePresence = useCallback(() => {
    deviceRegisteredRef.current = false;
    if (presenceTimerRef.current) {
      clearInterval(presenceTimerRef.current);
      presenceTimerRef.current = null;
    }
    if (telephonyV2 && organization?.id && userProfile?.id) {
      void telephonySupabase.from('telephony_presence').delete()
        .eq('organization_id', organization.id)
        .eq('user_id', userProfile.id)
        .eq('session_id', presenceSessionRef.current);
    }
  }, [telephonyV2, organization?.id, userProfile?.id]);

  const terminateActiveTransfer = useCallback(() => {
    const transfer = transferSessionRef.current;
    transferSessionRef.current = null;
    if (
      !transfer ||
      !organization?.id ||
      ['completed', 'canceled', 'failed'].includes(transfer.state)
    ) return;
    void supabase.functions.invoke('telephony-transfer-control', {
      headers: { 'x-organization-id': organization.id },
      body: { transferId: transfer.id, action: 'end_call' },
    });
  }, [organization?.id]);

  // Cleanup call state only (keep device)
  const cleanupCall = useCallback(() => {
    terminateActiveTransfer();
    clearStateTimeout();
    unsubscribeFromCallStatus();
    if (realtimeCleanupTimeoutRef.current) {
      clearTimeout(realtimeCleanupTimeoutRef.current);
      realtimeCleanupTimeoutRef.current = null;
    }
    if (activeCallRef.current) {
      try { activeCallRef.current.disconnect(); } catch {}
      activeCallRef.current = null;
    }
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus(isDeviceReady ? 'ready' : 'idle');
    setDuration(0);
    setIsMuted(false);
    setDtmfDigits('');
    setErrorMessage(null);
    setCallInfo(null);
    setActiveCallId(null);
    setIsMinimized(false);
    callIdRef.current = null;
    callStartTimeRef.current = null;
    pendingCallRef.current = null;
    callFinalizedRef.current = false;
    lastProcessedStatusRef.current = null;
    suppressCallFinalizationRef.current = false;
    transferCallRef.current = null;
    if (transferChannelRef.current) {
      supabase.removeChannel(transferChannelRef.current);
      transferChannelRef.current = null;
    }
    setTransferSession(null);
    setTransferTargets([]);
    numberSelectionRef.current = null;
    setNumberSelection(null);
    void updatePresence(null);
  }, [isDeviceReady, clearStateTimeout, unsubscribeFromCallStatus, updatePresence, terminateActiveTransfer]);

  // Keep ref in sync so realtime subscription can call cleanupCall without a circular dep
  cleanupCallRef.current = cleanupCall;

  // Full cleanup (including device)
  const fullCleanup = useCallback(() => {
    terminateActiveTransfer();
    deviceRegisteredRef.current = false;
    clearStateTimeout();
    unsubscribeFromCallStatus();
    if (activeCallRef.current) {
      try { activeCallRef.current.disconnect(); } catch {}
      activeCallRef.current = null;
    }
    if (deviceRef.current) {
      try { deviceRef.current.destroy(); } catch {}
      deviceRef.current = null;
    }
    if (incomingCallRef.current) {
      try { incomingCallRef.current.disconnect(); } catch {}
      incomingCallRef.current = null;
    }
    setIncomingCallInfo(null);
    setActiveIncomingCallInfo(null);
    setActiveIncomingCall(null);
    setIncomingMuted(false);
    if (transferCallRef.current) {
      try { transferCallRef.current.disconnect(); } catch {}
      transferCallRef.current = null;
    }
    if (transferChannelRef.current) {
      supabase.removeChannel(transferChannelRef.current);
      transferChannelRef.current = null;
    }
    setTransferSession(null);
    setTransferTargets([]);
    setTransferLoading(false);
    setActiveCallId(null);
    numberSelectionRef.current = null;
    setNumberSelection(null);
    suppressCallFinalizationRef.current = false;
    removePresence();
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    setStatus('idle');
    setDuration(0);
    setIsMuted(false);
    setDtmfDigits('');
    setErrorMessage(null);
    setCallInfo(null);
    setIsMinimized(false);
    setIsDeviceReady(false);
    if (initTimeoutRef.current) {
      clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = null;
    }
    if (realtimeCleanupTimeoutRef.current) {
      clearTimeout(realtimeCleanupTimeoutRef.current);
      realtimeCleanupTimeoutRef.current = null;
    }
    callIdRef.current = null;
    callStartTimeRef.current = null;
    pendingCallRef.current = null;
    tokenCacheRef.current = null;
    userDataCacheRef.current = null;
    isInitializingRef.current = false;
    callFinalizedRef.current = false;
    lastProcessedStatusRef.current = null;
  }, [clearStateTimeout, unsubscribeFromCallStatus, removePresence, terminateActiveTransfer]);

  // Update call record in database
  const updateCallRecord = useCallback(async (callStatus: string, endedAt?: Date) => {
    if (!callIdRef.current) return;

    try {
      const updateData: Record<string, any> = { status: callStatus };

      if (endedAt && callStartTimeRef.current) {
        const durationSeconds = Math.floor((endedAt.getTime() - callStartTimeRef.current.getTime()) / 1000);
        updateData.ended_at = endedAt.toISOString();
        updateData.duration_seconds = durationSeconds;
      }

      await supabase
        .from('calls')
        .update(updateData as never)
        .eq('id', callIdRef.current);

      console.log('Call record updated:', updateData);
    } catch (error) {
      console.error('Error updating call record:', error);
    }
  }, []);

  // Create call record in parallel (non-blocking)
  const createCallRecordAsync = useCallback(async (phoneNumber: string, contactId?: string, opportunityId?: string) => {
    try {
      const userData = await getUserData();
      if (!userData) return;

      callStartTimeRef.current = new Date();

      const { data: newCall } = await supabase.from('calls').insert({
        organization_id: userData.orgId,
        user_id: userData.userId,
        contact_id: contactId,
        opportunity_id: opportunityId,
        direction: 'outgoing',
        call_type: 'made',
        to_number: phoneNumber,
        status: 'queued',
        started_at: callStartTimeRef.current.toISOString(),
      }).select('id').single();

      if (newCall) {
        callIdRef.current = newCall.id;
        setActiveCallId(newCall.id);
        console.log('Call record created with ID:', newCall.id);
        // Subscribe to server-side status updates (dual-path sync)
        subscribeToCallStatus(newCall.id);
      }
    } catch (dbError) {
      console.error('Error recording call:', dbError);
    }
  }, [getUserData, subscribeToCallStatus]);

  // Make the actual call (fast path - device already ready)
  const makeCall = useCallback(async () => {
    if (!deviceRef.current || !pendingCallRef.current) {
      console.log('Device or pending call not ready');
      return;
    }

    const { phoneNumber, contactId, opportunityId, phoneNumberId } = pendingCallRef.current;

    try {
      setStatus('connecting');
      console.log('Connecting call to:', phoneNumber);

      // Timeout: if not ringing within 15s, something is wrong
      setStateTimeout(15000, 'Tempo esgotado ao conectar chamada');

      let connectParams: Record<string, string> = { To: phoneNumber };
      if (telephonyV2) {
        const { data, error } = await supabase.functions.invoke('telephony-call-intent', {
          body: { to: phoneNumber, contactId, opportunityId, phoneNumberId },
          headers: { 'x-organization-id': organization!.id },
        });
        if (error || !data?.callId || !data?.connectParams) {
          throw new Error(data?.error || 'Não foi possível preparar a chamada');
        }
        callIdRef.current = data.callId;
        setActiveCallId(data.callId);
        setCallInfo((current) => current ? { ...current, fromNumber: data.from, phoneNumberId: data.phoneNumberId } : current);
        callStartTimeRef.current = new Date();
        connectParams = data.connectParams as Record<string, string>;
        subscribeToCallStatus(data.callId);
        void updatePresence(data.callId);
      } else {
        // Legacy path remains available while the organization flag is off.
        createCallRecordAsync(phoneNumber, contactId, opportunityId);
      }

      // Connect the call IMMEDIATELY
      const call = await deviceRef.current.connect({
        params: connectParams,
      });

      activeCallRef.current = call;

      // Call events
      call.on('ringing', () => {
        if (callFinalizedRef.current) return;
        console.log('[SDK] Call ringing');
        lastProcessedStatusRef.current = 'ringing';
        clearStateTimeout();
        setStatus('ringing');
        updateCallRecord('ringing');
        setStateTimeout(60000, 'Chamada não atendida');
      });

      call.on('accept', () => {
        if (callFinalizedRef.current) return;
        console.log('[SDK] Call accepted/connected');
        lastProcessedStatusRef.current = 'in-progress';
        clearStateTimeout();
        setStatus('connected');
        updateCallRecord('in-progress');
        toast.success('Chamada conectada');
      });

      call.on('disconnect', () => {
        console.log('[SDK] Call disconnected');
        if (suppressCallFinalizationRef.current && transferSessionRef.current) return;
        callFinalizedRef.current = true;
        lastProcessedStatusRef.current = 'completed';
        clearStateTimeout();
        setStatus('ended');
        updateCallRecord('completed', new Date());
        void updatePresence(null);
      });

      call.on('cancel', () => {
        console.log('[SDK] Call cancelled');
        if (suppressCallFinalizationRef.current && transferSessionRef.current) return;
        callFinalizedRef.current = true;
        lastProcessedStatusRef.current = 'canceled';
        clearStateTimeout();
        setStatus('ended');
        updateCallRecord('canceled', new Date());
        void updatePresence(null);
      });

      call.on('reject', () => {
        console.log('[SDK] Call rejected');
        if (suppressCallFinalizationRef.current && transferSessionRef.current) return;
        callFinalizedRef.current = true;
        lastProcessedStatusRef.current = 'busy';
        clearStateTimeout();
        setStatus('failed');
        setErrorMessage('Chamada rejeitada');
        updateCallRecord('busy', new Date());
        void updatePresence(null);
      });

      call.on('error', (error: any) => {
        console.error('[SDK] Call error:', error);
        if (suppressCallFinalizationRef.current && transferSessionRef.current) return;
        callFinalizedRef.current = true;
        lastProcessedStatusRef.current = 'failed';
        clearStateTimeout();
        setErrorMessage(error?.message || 'Erro na chamada');
        setStatus('failed');
        updateCallRecord('failed', new Date());
        void updatePresence(null);
      });

    } catch (error: any) {
      console.error('Call connection error:', error);
      clearStateTimeout();
      void updatePresence(null);
      setErrorMessage(error.message || 'Erro ao conectar chamada');
      setStatus('failed');
    }
  }, [telephonyV2, organization, updateCallRecord, createCallRecordAsync, setStateTimeout, clearStateTimeout, subscribeToCallStatus, updatePresence]);

  // Initialize device (persistent - runs once)
  const initializeDevice = useCallback(async () => {
    // Prevent multiple initializations
    if (isInitializingRef.current || deviceRef.current) {
      console.log('Device already initialized or initializing');
      return;
    }

    try {
      isInitializingRef.current = true;
      setStatus('initializing');
      setErrorMessage(null);

      const session = await getVerifiedSession();
      if (!session?.access_token) {
        console.log('Not authenticated, skipping device initialization');
        isInitializingRef.current = false;
        setStatus('idle');
        return;
      }

      const token = await getToken();
      console.log('Got access token, initializing persistent device...');

      // Dynamic import: keeps @twilio/voice-sdk out of the eager static
      // graph so the main bundle never references its bindings during
      // initialization (fixes "Cannot access 'Lt' before initialization").
      const { Device, Call } = await import('@twilio/voice-sdk');

      const device = new Device(token, {
        codecPreferences: [Call.Codec.PCMU, Call.Codec.Opus],
        allowIncomingWhileBusy: false,
      });

      if (telephonyV2) {
        device.on('incoming', async (call) => {
          const transferId = call.customParameters?.get('TransferId') || undefined;
          const transferRole = call.customParameters?.get('TransferRole') === 'consult' ? 'consult' as const : undefined;
          const customerFrom = call.customParameters?.get('CustomerFrom') || '';
          const from = customerFrom || call.parameters.From || call.parameters.Caller || '';
          let contactName: string | undefined;
          let contactId: string | undefined;
          if (organization?.id && from) {
            const digits = from.replace(/\D/g, '');
            const e164 = from.startsWith('+') ? from : `+${digits}`;
            const { data: contact } = await supabase.from('contacts').select('id, full_name')
              .eq('organization_id', organization.id)
              .or(`phone.eq.${e164},phone_normalized.eq.${digits}`)
              .is('deleted_at', null).limit(1).maybeSingle();
            contactName = contact?.full_name;
            contactId = contact?.id;
          }
          const info: IncomingCallInfo = {
            from,
            contactName,
            contactId,
            transferId,
            transferRole,
            initiatorName: call.customParameters?.get('InitiatorName') || undefined,
          };
          incomingCallRef.current = call;
          setIncomingCallInfo(info);

          const callId = call.customParameters?.get('CallId') ?? null;
          if (callId) {
            callIdRef.current = callId;
            setActiveCallId(callId);
          }
          void updatePresence(callId);
          call.on('accept', () => {
            setActiveIncomingCall(call);
            setActiveIncomingCallInfo(info);
            setIncomingCallInfo(null);
            void updatePresence(callId);
            if (transferId) {
              if (transferChannelRef.current) supabase.removeChannel(transferChannelRef.current);
              transferChannelRef.current = supabase.channel(`transfer-recipient-${transferId}`)
                .on('postgres_changes', {
                  event: 'UPDATE', schema: 'public', table: 'call_transfers', filter: `id=eq.${transferId}`,
                }, (payload) => {
                  const next = payload.new as { state?: CallTransferState };
                  if (next.state === 'completed') {
                    // The consulted colleague is now the current call owner and
                    // may initiate a subsequent private transfer.
                    setActiveIncomingCallInfo((current) => current?.transferId === transferId
                      ? { ...current, transferRole: undefined }
                      : current);
                  }
                }).subscribe();
            }
          });
          const finish = () => {
            if (suppressCallFinalizationRef.current && transferSessionRef.current) return;
            incomingCallRef.current = null;
            setIncomingCallInfo(null);
            setActiveIncomingCall(null);
            setActiveIncomingCallInfo(null);
            setIncomingMuted(false);
            setActiveCallId(null);
            callIdRef.current = null;
            void updatePresence(null);
          };
          call.on('disconnect', finish);
          call.on('cancel', finish);
          call.on('reject', finish);
          call.on('error', finish);
        });
      }

      device.on('registered', () => {
        console.log('Twilio Device registered and ready');
        const expectedIdentity = organization?.id && userProfile?.id
          ? expectedTwilioIdentity(userProfile.id, organization.id)
          : null;
        if (!expectedIdentity || device.identity !== expectedIdentity) {
          console.error('[OutboundCall] Twilio identity mismatch', {
            expectedIdentity,
            actualIdentity: device.identity,
          });
          deviceRegisteredRef.current = false;
          setErrorMessage('Identidade da telefonia inválida. Atualize a página.');
          setStatus('failed');
          setIsDeviceReady(false);
          removePresence();
          return;
        }
        deviceRegisteredRef.current = true;
        setStatus('ready');
        setIsDeviceReady(true);
        isInitializingRef.current = false;
        startPresenceHeartbeat();
      });

      device.on('error', (error) => {
        console.error('Twilio Device error:', error);
        deviceRegisteredRef.current = false;
        setErrorMessage(error.message || 'Erro no dispositivo de áudio');
        setStatus('failed');
        setIsDeviceReady(false);
        removePresence();
        isInitializingRef.current = false;
      });

      device.on('unregistered', () => {
        console.log('Twilio Device unregistered');
        deviceRegisteredRef.current = false;
        setIsDeviceReady(false);
        setErrorMessage('Telefonia desconectada. Atualize a página para reconectar.');
        removePresence();
      });

      device.on('tokenWillExpire', async () => {
        console.log('Token will expire, refreshing...');
        try {
          // Clear cache to force refresh
          tokenCacheRef.current = null;
          const newToken = await getToken();
          device.updateToken(newToken);
          console.log('Token refreshed successfully');
        } catch (error) {
          console.error('Error refreshing token:', error);
        }
      });

      // Timeout: if device doesn't register within 10s, fail (tracked ref)
      if (initTimeoutRef.current) clearTimeout(initTimeoutRef.current);
      initTimeoutRef.current = setTimeout(() => {
        if (isInitializingRef.current) {
          console.warn('[OutboundCall] Device registration timeout');
          isInitializingRef.current = false;
          setStatus('failed');
          setErrorMessage('Tempo esgotado ao inicializar dispositivo de áudio');
          setIsDeviceReady(false);
        }
      }, 10000);

      device.on('registered', () => {
        if (initTimeoutRef.current) {
          clearTimeout(initTimeoutRef.current);
          initTimeoutRef.current = null;
        }
      });

      await device.register();
      deviceRef.current = device;

      // Pre-cache user data for faster call record creation
      getUserData();

    } catch (error: any) {
      console.error('Device initialization error:', error);
      setErrorMessage(error.message || 'Erro ao inicializar chamada');
      setStatus('failed');
      isInitializingRef.current = false;
    }
  }, [getToken, getUserData, telephonyV2, organization?.id, userProfile?.id, startPresenceHeartbeat, removePresence, updatePresence]);

  // Check voice integration availability (inline, no external context dependency)
  useEffect(() => {
    if (isAdminRoute) {
      setVoiceLoading(false);
      return;
    }
    setVoiceLoading(true);
    setHasVoiceIntegration(false);
    let cancelled = false;
    const check = async () => {
      try {
        const session = await getVerifiedSession();
        if (!session?.access_token || cancelled) {
          setVoiceLoading(false);
          return;
        }
        if (!organization?.id || cancelled) { setVoiceLoading(false); return; }

        const { data } = await supabase
          .from('organization_integrations')
          .select('id, admin_integrations!inner(slug, category)')
          .eq('organization_id', organization.id)
          .eq('is_enabled', true)
          .or('slug.eq.twilio-voice,category.eq.telephony', { referencedTable: 'admin_integrations' })
          .maybeSingle();

        if (!cancelled) {
          setHasVoiceIntegration(!!data);
          setVoiceLoading(false);
        }
      } catch {
        if (!cancelled) { setVoiceLoading(false); }
      }
    };
    check();
    return () => { cancelled = true; };
  }, [isAdminRoute, organization?.id]);

  // Initialize device on mount (persistent)
  // CRITICAL SECURITY: Never initialize in admin portal or without auth or without voice integration
  useEffect(() => {
    // Skip initialization in admin routes
    if (isAdminRoute) {
      console.log('[OutboundCall] Skipping initialization in admin route');
      return;
    }

    // Skip if voice integration is not enabled or still loading
    if (voiceLoading || telephonyFlagLoading || permissionsLoading || !hasVoiceIntegration || !isVoiceLeader || !canUseVoiceDevice) {
      console.log('[OutboundCall] Voice integration not enabled, skipping device initialization');
      return;
    }

    let timer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    // Check auth before initializing
    const checkAuthAndInitialize = async () => {
      try {
        const session = await getVerifiedSession();
        if (!session?.access_token) {
          console.log('[OutboundCall] Not authenticated, skipping device initialization');
          return;
        }

        if (isMounted) {
          // Small delay to ensure everything is ready
          timer = setTimeout(() => {
            if (isMounted) {
              initializeDevice();
            }
          }, 1000);
        }
      } catch (error) {
        console.log('[OutboundCall] Auth check failed:', error);
      }
    };

    checkAuthAndInitialize();

    return () => {
      isMounted = false;
      if (timer) {
        clearTimeout(timer);
      }
      fullCleanup();
    };
  }, [isAdminRoute, organization?.id, userProfile?.id, hasVoiceIntegration, voiceLoading, telephonyFlagLoading, permissionsLoading, isVoiceLeader, canUseVoiceDevice]);

  const applyTransferUpdate = useCallback((next: { state: CallTransferState; failure_reason?: string | null }) => {
    const current = transferSessionRef.current;
    if (!current) return;
    const stateChanged = current.state !== next.state;
    const updated: CallTransferSession = {
      ...current,
      state: next.state,
      error: next.failure_reason || null,
    };
    transferSessionRef.current = updated;
    setTransferSession(updated);
    if (!stateChanged) return;
    if (next.state === 'completed') {
      suppressCallFinalizationRef.current = false;
      void updatePresence(null);
      if (transferOriginRef.current === 'incoming') {
        incomingCallRef.current = null;
        setActiveIncomingCall(null);
        setActiveIncomingCallInfo(null);
      } else {
        setStatus('ended');
      }
      setTimeout(() => cleanupCallRef.current?.(), 1200);
    } else if (next.state === 'canceled') {
      suppressCallFinalizationRef.current = false;
      setTimeout(() => {
        setTransferSession(null);
        transferSessionRef.current = null;
        if (transferChannelRef.current) {
          supabase.removeChannel(transferChannelRef.current);
          transferChannelRef.current = null;
        }
      }, 800);
    } else if (next.state === 'failed') {
      suppressCallFinalizationRef.current = false;
      setErrorMessage('A transferência falhou');
    }
  }, [updatePresence]);

  const subscribeToTransfer = useCallback((transferId: string) => {
    if (transferChannelRef.current) supabase.removeChannel(transferChannelRef.current);
    transferChannelRef.current = supabase.channel(`call-transfer-${transferId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'call_transfers', filter: `id=eq.${transferId}`,
      }, (payload) => {
        const next = payload.new as { state: CallTransferState; failure_reason?: string | null };
        applyTransferUpdate(next);
      }).subscribe();
  }, [applyTransferUpdate]);

  // Realtime is the low-latency path, while polling guarantees that a dropped
  // publication event cannot leave the modal stuck in a transitional state.
  useEffect(() => {
    const transferId = transferSession?.id;
    if (!transferId) return;
    let disposed = false;
    let loading = false;
    const refresh = async () => {
      if (disposed || loading) return;
      loading = true;
      try {
        const { data, error } = await telephonySupabase.from('call_transfers')
          .select('state, failure_reason')
          .eq('id', transferId)
          .maybeSingle();
        if (!disposed && !error && data?.state) {
          applyTransferUpdate({
            state: data.state as CallTransferState,
            failure_reason: data.failure_reason,
          });
        }
      } finally {
        loading = false;
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [transferSession?.id, applyTransferUpdate]);

  const connectTransferCall = useCallback(async (params: Record<string, string>) => {
    if (!deviceRef.current) throw new Error('Dispositivo de telefonia indisponível');
    // The provider redirect normally closes the previous direct bridge first.
    // A short yield prevents the SDK from treating the consultation as a
    // simultaneous call while allowIncomingWhileBusy is disabled.
    await new Promise((resolve) => setTimeout(resolve, 250));
    const call = await deviceRef.current.connect({ params });
    transferCallRef.current = call;
    if (transferOriginRef.current === 'incoming') {
      incomingCallRef.current = call;
      setActiveIncomingCall(call);
    } else {
      activeCallRef.current = call;
    }
    call.on('error', (error: unknown) => {
      console.error('[TelephonyTransfer] consult call error', error);
      const message = error instanceof Error ? error.message : 'Falha na consulta';
      setTransferSession((current) => current ? { ...current, error: message } : current);
    });
    call.on('disconnect', () => {
      const current = transferSessionRef.current;
      if (!current || ['completed', 'canceled', 'failed'].includes(current.state)) return;
      if (current.state === 'handoff_pending') {
        applyTransferUpdate({ state: 'completed' });
      } else if (current.state === 'with_customer') {
        applyTransferUpdate({ state: 'canceled' });
        suppressCallFinalizationRef.current = false;
        void updatePresence(null);
        if (organization?.id) {
          void supabase.functions.invoke('telephony-transfer-control', {
            headers: { 'x-organization-id': organization.id },
            body: { transferId: current.id, action: 'end_call' },
          });
        }
      }
    });
    return call;
  }, [applyTransferUpdate, organization?.id, updatePresence]);

  const loadTransferTargets = useCallback(async () => {
    if (!organization?.id || !callIdRef.current || !canTransferCalls) return;
    setTransferLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('telephony-transfer-intent', {
        headers: { 'x-organization-id': organization.id },
        body: { action: 'targets', callId: callIdRef.current },
      });
      if (error || data?.error) throw new Error(data?.error || 'Não foi possível consultar a equipe');
      setTransferTargets(data.targets || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao consultar usuários disponíveis');
      setTransferTargets([]);
    } finally {
      setTransferLoading(false);
    }
  }, [organization?.id, canTransferCalls]);

  const startTransfer = useCallback(async (target: CallTransferTarget) => {
    if (!organization?.id || !callIdRef.current || !canTransferCalls || transferSessionRef.current) return;
    setTransferLoading(true);
    suppressCallFinalizationRef.current = true;
    transferOriginRef.current = activeIncomingCall || incomingCallRef.current ? 'incoming' : 'outgoing';
    try {
      const { data, error } = await supabase.functions.invoke('telephony-transfer-intent', {
        headers: { 'x-organization-id': organization.id },
        body: { callId: callIdRef.current, targetUserId: target.userId },
      });
      if (error || data?.error || !data?.transferId || !data?.connectParams) {
        throw new Error(data?.error || 'Não foi possível iniciar a transferência');
      }
      const session: CallTransferSession = {
        id: data.transferId,
        callId: callIdRef.current,
        targetUserId: target.userId,
        targetName: target.fullName,
        state: data.state || 'customer_queued',
      };
      transferSessionRef.current = session;
      setTransferSession(session);
      subscribeToTransfer(data.transferId);
      try { activeCallRef.current?.disconnect(); } catch { /* provider leg may already be redirected */ }
      try { activeIncomingCall?.disconnect(); } catch { /* provider leg may already be redirected */ }
      await connectTransferCall(data.connectParams as Record<string, string>);
      toast.success(`Cliente em espera. Chamando ${target.fullName}.`);
    } catch (error) {
      suppressCallFinalizationRef.current = false;
      toast.error(error instanceof Error ? error.message : 'Erro ao iniciar transferência');
      setTransferSession(null);
      transferSessionRef.current = null;
    } finally {
      setTransferLoading(false);
    }
  }, [organization?.id, canTransferCalls, activeIncomingCall, subscribeToTransfer, connectTransferCall]);

  const controlTransfer = useCallback(async (action: 'return_to_customer' | 'consult_again' | 'complete' | 'cancel') => {
    const current = transferSessionRef.current;
    if (!organization?.id || !current) return;
    setTransferLoading(true);
    try {
      if (action === 'consult_again') suppressCallFinalizationRef.current = true;
      const { data, error } = await supabase.functions.invoke('telephony-transfer-control', {
        headers: { 'x-organization-id': organization.id },
        body: { transferId: current.id, action },
      });
      if (error || data?.error) throw new Error(data?.error || 'Não foi possível controlar a transferência');
      const updated = { ...current, state: data.state as CallTransferState, error: null };
      transferSessionRef.current = updated;
      setTransferSession(updated);
      if (data.connectParams) await connectTransferCall(data.connectParams as Record<string, string>);
      if (action === 'complete') toast.success(`Transferindo para ${current.targetName}`);
      if (action === 'return_to_customer') toast.success('Voltando para o cliente');
      if (action === 'cancel') toast.success('Transferência encerrada; você continua com o cliente');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro na transferência');
      setTransferSession((session) => session ? { ...session, error: error instanceof Error ? error.message : 'Erro na transferência' } : session);
    } finally {
      setTransferLoading(false);
    }
  }, [organization?.id, connectTransferCall]);

  // Start a new call
  const beginCall = useCallback((params: CallInfo) => {
    if (telephonyV2 && !permissions.canMakeCalls) {
      toast.error('Você não tem permissão para realizar chamadas');
      return;
    }
    // Clean up any existing call first (but keep device)
    const replacingActiveCall = isOnCall;
    if (replacingActiveCall) {
      cleanupCall();
    }

    setCallInfo(params);
    pendingCallRef.current = params;

    const connect = () => {
      if (isDeviceReady && deviceRef.current) {
        console.log('Device ready, starting call immediately');
        makeCall();
      } else {
        console.log('Device not ready, initializing...');
        initializeDevice();
      }
    };
    // Twilio closes the previous browser leg asynchronously. Give it a short
    // window before opening a replacement call on the same Device.
    if (replacingActiveCall) window.setTimeout(connect, 350);
    else connect();
  }, [telephonyV2, permissions.canMakeCalls, isOnCall, cleanupCall, isDeviceReady, makeCall, initializeDevice]);

  const startCall = useCallback((params: CallInfo) => {
    const requestId = ++outboundSelectionRequestRef.current;
    numberSelectionRef.current = null;
    setNumberSelection(null);
    if (!telephonyV2 || params.phoneNumberId || !organization?.id || !userProfile?.id) {
      beginCall(params);
      return;
    }
    void (async () => {
      try {
        const [{ data: numbers }, { data: grants }] = await Promise.all([
          telephonySupabase.from('organization_phone_numbers').select('id, phone_number, friendly_name, number_type, assigned_user_id, is_default_outbound')
            .eq('organization_id', organization.id).eq('is_active', true),
          telephonySupabase.from('organization_phone_number_users').select('phone_number_id, user_id, can_originate_calls')
            .eq('organization_id', organization.id).eq('user_id', userProfile.id).eq('can_originate_calls', true),
        ]);
        const grantIds = new Set((grants || []).map((grant) => grant.phone_number_id));
        const options = (numbers || []).filter((number) =>
          (number.number_type === 'user' && number.assigned_user_id === userProfile.id) || grantIds.has(number.id)
        ).sort((left, right) => {
          const leftRank = left.number_type === 'user' && left.assigned_user_id === userProfile.id ? 0 : left.is_default_outbound ? 1 : 2;
          const rightRank = right.number_type === 'user' && right.assigned_user_id === userProfile.id ? 0 : right.is_default_outbound ? 1 : 2;
          return leftRank - rightRank;
        }).map((number, index) => ({
          id: number.id,
          phoneNumber: number.phone_number,
          friendlyName: number.friendly_name || number.phone_number,
          numberType: number.number_type === 'user' ? ('user' as const) : ('company' as const),
          automatic: index === 0,
        }));
        if (requestId !== outboundSelectionRequestRef.current) return;
        if (options.length <= 1) {
          beginCall({ ...params, phoneNumberId: options[0]?.id });
          return;
        }
        const selection = { call: params, options };
        numberSelectionRef.current = selection;
        setNumberSelection(selection);
      } catch (error) {
        if (requestId !== outboundSelectionRequestRef.current) return;
        console.warn('[Telephony] Could not preselect outbound number; backend will resolve it', error);
        beginCall(params);
      }
    })();
  }, [telephonyV2, organization?.id, userProfile?.id, beginCall]);

  const selectOutboundNumber = useCallback((phoneNumberId: string) => {
    const selection = numberSelectionRef.current;
    if (!selection || !selection.options.some((option) => option.id === phoneNumberId)) return;
    outboundSelectionRequestRef.current += 1;
    numberSelectionRef.current = null;
    setNumberSelection(null);
    beginCall({ ...selection.call, phoneNumberId });
  }, [beginCall]);

  const cancelOutboundNumberSelection = useCallback(() => {
    outboundSelectionRequestRef.current += 1;
    numberSelectionRef.current = null;
    setNumberSelection(null);
  }, []);

  // End the current call
  const endCall = useCallback(() => {
    clearStateTimeout();

    const transfer = transferSessionRef.current;
    if (transfer && organization?.id) {
      const endingTransfer = { ...transfer, state: 'canceled' as CallTransferState };
      transferSessionRef.current = endingTransfer;
      setTransferSession(endingTransfer);
      void supabase.functions.invoke('telephony-transfer-control', {
        headers: { 'x-organization-id': organization.id },
        body: { transferId: transfer.id, action: 'end_call' },
      });
      suppressCallFinalizationRef.current = false;
    }

    if (activeCallRef.current) {
      try {
        activeCallRef.current.disconnect();
      } catch (e) {
        console.warn('[OutboundCall] Error disconnecting call:', e);
      }
    }
    setStatus('ended');
    updateCallRecord('completed', new Date());
    void updatePresence(null);

    // Force cleanup after short delay — don't wait for disconnect event
    setTimeout(() => {
      activeCallRef.current = null;
      cleanupCall();
    }, 1500);
  }, [cleanupCall, clearStateTimeout, updateCallRecord, updatePresence, organization?.id]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (activeCallRef.current) {
      const newMuted = !isMuted;
      activeCallRef.current.mute(newMuted);
      setIsMuted(newMuted);
      toast(newMuted ? 'Microfone mutado' : 'Microfone ativado');
    }
  }, [isMuted]);

  // Send DTMF
  const sendDTMF = useCallback((digit: string) => {
    if (activeCallRef.current && status === 'connected') {
      activeCallRef.current.sendDigits(digit);
      setDtmfDigits((prev) => prev + digit);
    }
  }, [status]);

  // Effect: Make call when device becomes ready (for pending calls)
  useEffect(() => {
    if (status === 'ready' && pendingCallRef.current && !activeCallRef.current) {
      makeCall();
    }
  }, [status, makeCall]);

  // Effect: Timer for call duration
  useEffect(() => {
    if (status === 'connected' && !timerRef.current) {
      timerRef.current = setInterval(() => {
        setDuration((prev) => prev + 1);
      }, 1000);
    }

    if (status === 'ended' || status === 'failed' || status === 'idle') {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    }
  }, [status]);

  const answerIncomingCall = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return;
    call.accept();
  }, []);

  const rejectIncomingCall = useCallback(() => {
    const call = incomingCallRef.current;
    if (!call) return;
    call.reject();
    incomingCallRef.current = null;
    setIncomingCallInfo(null);
    void updatePresence(null);
  }, [updatePresence]);

  const endIncomingCall = useCallback(() => {
    const transfer = transferSessionRef.current;
    if (transfer && organization?.id) {
      void supabase.functions.invoke('telephony-transfer-control', {
        headers: { 'x-organization-id': organization.id },
        body: { transferId: transfer.id, action: 'end_call' },
      });
      suppressCallFinalizationRef.current = false;
    }
    const call = activeIncomingCall ?? incomingCallRef.current;
    if (call) call.disconnect();
    incomingCallRef.current = null;
    setIncomingCallInfo(null);
    setActiveIncomingCall(null);
    setActiveIncomingCallInfo(null);
    setIncomingMuted(false);
    void updatePresence(null);
  }, [activeIncomingCall, updatePresence, organization?.id]);

  const toggleIncomingMute = useCallback(() => {
    if (!activeIncomingCall) return;
    const next = !incomingMuted;
    activeIncomingCall.mute(next);
    setIncomingMuted(next);
  }, [activeIncomingCall, incomingMuted]);

  const value: OutboundCallContextType = {
    startCall,
    isOnCall,
    callInfo,
    status,
    duration,
    errorMessage,
    endCall,
    toggleMute,
    isMuted,
    sendDTMF,
    dtmfDigits,
    isMinimized,
    setMinimized: setIsMinimized,
    isDeviceReady,
    telephonyV2,
    incomingCallInfo,
    activeIncomingCallInfo,
    activeIncomingCall,
    isOnIncomingCall,
    incomingMuted,
    answerIncomingCall,
    rejectIncomingCall,
    endIncomingCall,
    toggleIncomingMute,
    activeCallId,
    canTransferCalls,
    transferSession,
    transferTargets,
    transferLoading,
    loadTransferTargets,
    startTransfer,
    controlTransfer,
    numberSelection,
    selectOutboundNumber,
    cancelOutboundNumberSelection,
  };

  return (
    <OutboundCallContext.Provider value={value}>
      {children}
    </OutboundCallContext.Provider>
  );
}

// Compatibility export while callers migrate to the provider-neutral name.
export const OutboundCallProvider = TelephonyProvider;
