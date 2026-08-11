import React, { useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import type { Device as TwilioDevice, Call as TwilioCall } from '@twilio/voice-sdk';
import { supabase } from '@/integrations/supabase/client';
import { telephonySupabase } from '@/integrations/supabase/telephonyClient';
import { toast } from 'sonner';
import { getTelephonySession, getTwilioAccessToken, getVerifiedSession } from '@/lib/authSession';
import { voiceCodecPreferences } from '@/lib/telephony';
import { startRingback, stopRingback } from '@/lib/ringback';
import { useOrganization } from '@/hooks/useOrganization';
import { useTelephonyV2Flag } from '@/hooks/useTelephonyV2Flag';
import { usePermissions } from '@/hooks/usePermissions';

import { OutboundCallContext } from './outbound-call/context';
import type { CallInfo, CallStatus, IncomingCallInfo, OutboundCallContextType, TokenCache, CallTransferSession, CallTransferTarget, CallTransferState, OutboundNumberSelection, CallTransferOperation } from './outbound-call/types';
import { closeTransferLegs, isTransferGenerationCurrent } from './outbound-call/transferLegCoordinator';
import { toErrorMessageString } from '@/lib/errorMessage';

// Re-export public API so existing import paths
// (`@/contexts/OutboundCallContext`) keep working unchanged.
export { useOutboundCall } from './outbound-call/context';
export type { CallStatus, CallInfo } from './outbound-call/types';

function expectedTwilioIdentity(userId: string, organizationId: string) {
  return `user_${userId.replace(/[^A-Za-z0-9]/g, '')}_org_${organizationId.replace(/[^A-Za-z0-9]/g, '')}`;
}

const TRANSFER_ERRORS: Record<string, string> = {
  transfer_target_unavailable: 'Essa pessoa está ocupada, offline ou com uma reserva ativa.',
  transfer_target_not_authorized: 'Essa pessoa não está autorizada a receber transferências.',
  transfer_state_changed: 'O estado da transferência mudou. Atualizamos o modal; tente novamente.',
  target_not_connected: 'A pessoa ainda não atendeu a consulta.',
  previous_voice_leg_still_active: 'A conexão anterior ainda está sendo encerrada.',
  customer_not_with_initiator: 'O cliente ainda não voltou para você.',
  customer_cannot_be_retrieved_in_current_state: 'Não foi possível recuperar o cliente neste momento.',
  transfer_already_finished: 'Essa transferência já foi encerrada.',
};

function transferErrorMessage(error: unknown) {
  const raw = error instanceof Error ? error.message : String(error || 'transfer_failed');
  return TRANSFER_ERRORS[raw] || raw || 'Não foi possível concluir a transferência.';
}

async function withTransferTimeout<T>(promise: PromiseLike<T>, timeoutMs = 8_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error('A Twilio demorou para confirmar. Recuperando o estado…')), timeoutMs);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
  const [transferOperation, setTransferOperation] = useState<CallTransferOperation | null>(null);
  const [audioReconnecting, setAudioReconnecting] = useState(false);
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
  // Last error reported by the Twilio Device (register() can reject with a nullish value)
  const lastDeviceErrorRef = useRef<any>(null);
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
  const transferConnectGenerationRef = useRef(0);

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
    // Libera a lease de líder na saída/refresh da página. O cleanup do effect NÃO
    // roda de forma confiável num reload de página inteira (F5/hard refresh), então
    // um listener de `pagehide` garante que a próxima carga/aba vire líder NA HORA
    // em vez de esperar a lease de 15s expirar. Era isso que adiava o pré-aquecimento
    // do device (device-init preso em isVoiceLeader=false por ~10s) e deixava a 1ª
    // ligação após um reload lenta. Só libera o lock — nunca cria dois líderes.
    const release = () => {
      try {
        const current = JSON.parse(window.localStorage.getItem(key) || '{}');
        if (current.tabId === tabId) window.localStorage.removeItem(key);
      } catch { /* Ignore a malformed stale lease. */ }
    };
    window.addEventListener('pagehide', release);
    return () => {
      clearInterval(timer);
      window.removeEventListener('pagehide', release);
      release();
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
    stopRingback();
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
    setTransferOperation(null);
    setTransferLoading(false);
    transferConnectGenerationRef.current += 1;
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
      console.warn('[PERF] fullCleanup DESTROYING Twilio Device @', Math.round(performance.now()));
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
    setTransferOperation(null);
    transferConnectGenerationRef.current += 1;
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

      // Ringback local IMEDIATO: mascara o gap de setup (call-intent + WebRTC + /voice
      // + disca PSTN, ~1-2s estruturais) com um tom de chamada na hora do clique, em
      // vez de silêncio. Para no 'ringing' (o ringback real da operadora assume) ou no
      // atendimento/fim/erro. Só na ligação normal — as pernas de transferência não.
      startRingback();

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
        // Chegou o toque real (early media da operadora) — encerra o ringback local
        // e passa a bola pro áudio da chamada.
        stopRingback();
        if (callFinalizedRef.current) return;
        console.log('[SDK] Call ringing');
        lastProcessedStatusRef.current = 'ringing';
        clearStateTimeout();
        setStatus('ringing');
        updateCallRecord('ringing');
        setStateTimeout(60000, 'Chamada não atendida');
      });

      call.on('accept', () => {
        stopRingback();
        if (callFinalizedRef.current) return;
        console.log('[SDK] Call accepted/connected');
        lastProcessedStatusRef.current = 'in-progress';
        clearStateTimeout();
        setStatus('connected');
        updateCallRecord('in-progress');
        toast.success('Chamada conectada');
      });

      call.on('disconnect', () => {
        stopRingback();
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
        stopRingback();
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
        stopRingback();
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
        stopRingback();
        console.error('[SDK] Call error:', error);
        if (suppressCallFinalizationRef.current && transferSessionRef.current) return;
        callFinalizedRef.current = true;
        lastProcessedStatusRef.current = 'failed';
        clearStateTimeout();
        setErrorMessage(toErrorMessageString(error, 'Erro na chamada'));
        setStatus('failed');
        updateCallRecord('failed', new Date());
        void updatePresence(null);
      });

    } catch (error: any) {
      stopRingback();
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
      console.log('[PERF] initializeDevice START @', Math.round(performance.now()));
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
      console.log('[PERF] token fetched @', Math.round(performance.now()));

      // Dynamic import: keeps @twilio/voice-sdk out of the eager static
      // graph so the main bundle never references its bindings during
      // initialization (fixes "Cannot access 'Lt' before initialization").
      const { Device, Call } = await import('@twilio/voice-sdk');

      const device = new Device(token, {
        codecPreferences: voiceCodecPreferences(Call.Codec),
        allowIncomingWhileBusy: false,
      });
      // Remove os "blips" do SDK nas transições de perna da transferência:
      //  - `disconnect`: tocava ao PARKEAR (perna do atendente cai).
      //  - `outgoing`: tocava ao RETOMAR (navegador re-disca a perna pra buscar o
      //    cliente de volta).
      // Mantemos `incoming` (toque de chamada recebida é feedback útil). O feedback
      // visual da UI já cobre; não afeta chamadas normais de forma relevante.
      try { device.audio?.disconnect(false); } catch { /* audio API opcional */ }
      try { device.audio?.outgoing(false); } catch { /* idem */ }

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
        console.log('[PERF] device REGISTERED @', Math.round(performance.now()));
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
      console.log('[PERF] device-init SKIP @', Math.round(performance.now()), { voiceLoading, telephonyFlagLoading, permissionsLoading, hasVoiceIntegration, isVoiceLeader, canUseVoiceDevice });
      return;
    }
    console.log('[PERF] device-init PROCEED @', Math.round(performance.now()));

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
          // Pré-aquece o device IMEDIATAMENTE (sem delay artificial) para reduzir
          // o tempo até a 1ª discagem. O gate acima já garante que voz/flags/
          // permissões carregaram, e initializeDevice é idempotente (guarda própria).
          initializeDevice();
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

  const applyTransferUpdate = useCallback((next: {
    state: CallTransferState;
    version?: number;
    consultation_sequence?: number;
    failure_reason?: string | null;
  }) => {
    const current = transferSessionRef.current;
    if (!current) return;
    // Guard de versão monotônica: ignora reconciliações ATRASADAS (poll de 1s /
    // realtime que leram a linha antes do backend commitar). O backend sempre
    // bumpa `version` a cada escrita — inclusive nos rollbacks de falha, sempre
    // com versão MAIOR — então uma versão menor é sempre stale. Isso é o que torna
    // o estado otimista à prova de reversão.
    if (
      typeof next.version === 'number' &&
      typeof current.version === 'number' &&
      next.version < current.version
    ) return;
    const stateChanged = current.state !== next.state;
    const updated: CallTransferSession = {
      ...current,
      state: next.state,
      version: next.version ?? current.version,
      consultationSequence: next.consultation_sequence ?? current.consultationSequence,
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
      transferConnectGenerationRef.current += 1;
      setTransferSession(null);
      transferSessionRef.current = null;
      if (transferChannelRef.current) {
        supabase.removeChannel(transferChannelRef.current);
        transferChannelRef.current = null;
      }
    } else if (next.state === 'failed') {
      suppressCallFinalizationRef.current = false;
      setErrorMessage('A transferência falhou');
    }
  }, [updatePresence]);

  // Single source of truth for reading the transfer row and applying it.
  // Shared by the 1s polling safety net and the realtime channel-degraded
  // fallback. Logs errors instead of swallowing them so a schema drift (e.g. a
  // missing column) can never again silently kill the sync.
  const refreshTransferState = useCallback(async (transferId: string) => {
    // 'pending' é a sessão provisória do hold (ainda sem linha no banco): não há
    // o que ler. Evita GET call_transfers?id=eq.pending -> 400 (uuid inválido).
    if (!transferId || transferId === 'pending') return;
    const { data, error } = await telephonySupabase.from('call_transfers')
      .select('state, version, consultation_sequence, failure_reason')
      .eq('id', transferId)
      .maybeSingle();
    if (error) {
      console.error('[TelephonyTransfer] state poll failed', error);
      return;
    }
    if (data?.state) {
      applyTransferUpdate({
        state: data.state as CallTransferState,
        version: data.version,
        consultation_sequence: data.consultation_sequence,
        failure_reason: data.failure_reason,
      });
    }
  }, [applyTransferUpdate]);

  const subscribeToTransfer = useCallback((transferId: string) => {
    if (transferChannelRef.current) supabase.removeChannel(transferChannelRef.current);
    transferChannelRef.current = supabase.channel(`call-transfer-${transferId}`)
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'call_transfers', filter: `id=eq.${transferId}`,
      }, (payload) => {
        const next = payload.new as {
          state: CallTransferState;
          version?: number;
          consultation_sequence?: number;
          failure_reason?: string | null;
        };
        applyTransferUpdate(next);
      }).subscribe((status) => {
        // If the realtime channel drops, immediately reconcile via a direct
        // read so the modal never waits on the next 1s tick to recover.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          void refreshTransferState(transferId);
        }
      });
  }, [applyTransferUpdate, refreshTransferState]);

  // Realtime is the low-latency path, while polling guarantees that a dropped
  // publication event cannot leave the modal stuck in a transitional state.
  useEffect(() => {
    const transferId = transferSession?.id;
    // Não pollar a sessão provisória do hold ('pending', sem linha no banco).
    if (!transferId || transferId === 'pending') return;
    let disposed = false;
    let loading = false;
    const refresh = async () => {
      if (disposed || loading) return;
      loading = true;
      try {
        await refreshTransferState(transferId);
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
  }, [transferSession?.id, refreshTransferState]);

  const connectTransferCall = useCallback(async (
    params: Record<string, string>,
    session: CallTransferSession,
  ) => {
    const device = deviceRef.current;
    if (!device) throw new Error('Dispositivo de telefonia indisponível');
    // Indicador leve "reconectando áudio" cobre o teardown + renegociação WebRTC
    // (a parte REAL dos ~0.5-1.5s), sem travar o modal. Reset garantido no finally.
    setAudioReconnecting(true);
    try {
    const generation = ++transferConnectGenerationRef.current;
    await closeTransferLegs(device, [
      transferCallRef.current,
      activeCallRef.current,
      incomingCallRef.current,
      activeIncomingCall,
    ]);
    if (
      generation !== transferConnectGenerationRef.current ||
      !isTransferGenerationCurrent(
        transferSessionRef.current,
        session.id,
        session.consultationSequence,
      )
    ) throw new Error('transfer_state_changed');

    const call = await device.connect({ params });
    if (
      generation !== transferConnectGenerationRef.current ||
      !isTransferGenerationCurrent(
        transferSessionRef.current,
        session.id,
        session.consultationSequence,
      )
    ) {
      call.disconnect();
      throw new Error('transfer_state_changed');
    }
    transferCallRef.current = call;
    // Nova perna (retomar/consultar) volta desmutada — o mute aplicado no hold
    // não persiste na próxima conversa.
    try { call.mute(false); } catch { /* noop */ }
    setIsMuted(false);
    if (transferOriginRef.current === 'incoming') {
      incomingCallRef.current = call;
      setActiveIncomingCall(call);
    } else {
      activeCallRef.current = call;
    }
    call.on('error', (error: unknown) => {
      if (!isTransferGenerationCurrent(transferSessionRef.current, session.id, session.consultationSequence)) return;
      console.error('[TelephonyTransfer] consult call error', error);
      const message = error instanceof Error ? error.message : 'Falha na consulta';
      setTransferSession((current) => current ? { ...current, error: message } : current);
    });
    call.on('disconnect', () => {
      if (transferCallRef.current === call) transferCallRef.current = null;
      if (activeCallRef.current === call) activeCallRef.current = null;
      if (incomingCallRef.current === call) incomingCallRef.current = null;
      if (transferOriginRef.current === 'incoming') {
        setActiveIncomingCall((currentCall) => currentCall === call ? null : currentCall);
      }
      if (!isTransferGenerationCurrent(transferSessionRef.current, session.id, session.consultationSequence)) return;
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
    } finally {
      setAudioReconnecting(false);
    }
  }, [activeIncomingCall, applyTransferUpdate, organization?.id, updatePresence]);

  const loadTransferTargets = useCallback(async () => {
    if (!organization?.id || !callIdRef.current || !canTransferCalls) return;
    setTransferLoading(true);
    setTransferOperation('loading_targets');
    try {
      const { data, error } = await withTransferTimeout(supabase.functions.invoke('telephony-transfer-intent', {
        headers: { 'x-organization-id': organization.id },
        body: { action: 'targets', callId: callIdRef.current },
      }));
      if (error || data?.error) throw new Error(data?.error || 'Não foi possível consultar a equipe');
      setTransferTargets(data.targets || []);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Erro ao consultar usuários disponíveis');
      setTransferTargets([]);
    } finally {
      setTransferLoading(false);
      setTransferOperation(null);
    }
  }, [organization?.id, canTransferCalls]);

  const recoverCustomerAfterConnectionFailure = useCallback(async (session: CallTransferSession) => {
    if (!organization?.id) return;
    setTransferOperation('recovering');
    try {
      const { data, error } = await withTransferTimeout(supabase.functions.invoke('telephony-transfer-control', {
        headers: { 'x-organization-id': organization.id },
        body: {
          transferId: session.id,
          action: 'return_to_customer',
          expectedVersion: session.version,
          requestId: crypto.randomUUID(),
        },
      }));
      if (error || data?.error) throw new Error(data?.error || 'Não foi possível recuperar o cliente');
      const recovered: CallTransferSession = {
        ...session,
        state: data.state as CallTransferState,
        version: data.version ?? session.version,
        consultationSequence: data.consultationSequence ?? session.consultationSequence,
        error: null,
      };
      transferSessionRef.current = recovered;
      setTransferSession(recovered);
      if (data.connectParams) {
        await connectTransferCall(data.connectParams as Record<string, string>, recovered);
      }
      toast.warning('A consulta não abriu; o cliente está voltando para você.');
    } catch (recoveryError) {
      const message = transferErrorMessage(recoveryError);
      setTransferSession((current) => current ? { ...current, error: message } : current);
      toast.error(`Falha ao recuperar o cliente: ${message}`);
    } finally {
      setTransferOperation(null);
    }
  }, [connectTransferCall, organization?.id]);

  const startTransfer = useCallback(async (target: CallTransferTarget) => {
    if (!organization?.id || !callIdRef.current || !canTransferCalls || transferSessionRef.current) return;
    setTransferLoading(true);
    setTransferOperation('starting');
    suppressCallFinalizationRef.current = true;
    transferOriginRef.current = activeIncomingCall || incomingCallRef.current ? 'incoming' : 'outgoing';
    try {
      const requestId = crypto.randomUUID();
      const { data, error } = await withTransferTimeout(supabase.functions.invoke('telephony-transfer-intent', {
        headers: { 'x-organization-id': organization.id },
        body: { callId: callIdRef.current, targetUserId: target.userId, requestId },
      }));
      if (error || data?.error || !data?.transferId || !data?.connectParams) {
        throw new Error(data?.error || 'Não foi possível iniciar a transferência');
      }
      const session: CallTransferSession = {
        id: data.transferId,
        callId: callIdRef.current,
        targetUserId: target.userId,
        targetName: target.fullName,
        state: data.state || 'customer_queued',
        version: data.version ?? 1,
        consultationSequence: data.consultationSequence ?? 1,
      };
      transferSessionRef.current = session;
      setTransferSession(session);
      subscribeToTransfer(data.transferId);
      try {
        await connectTransferCall(data.connectParams as Record<string, string>, session);
      } catch (connectError) {
        console.error('[TelephonyTransfer] initial consultation connection failed', connectError);
        await recoverCustomerAfterConnectionFailure(session);
        throw connectError;
      }
      toast.success(`Cliente em espera. Chamando ${target.fullName}.`);
    } catch (error) {
      if (!transferSessionRef.current) suppressCallFinalizationRef.current = false;
      toast.error(transferErrorMessage(error));
      if (!transferSessionRef.current) {
        setTransferSession(null);
        transferSessionRef.current = null;
      }
    } finally {
      setTransferLoading(false);
      setTransferOperation(null);
    }
  }, [organization?.id, canTransferCalls, activeIncomingCall, subscribeToTransfer, connectTransferCall, recoverCustomerAfterConnectionFailure]);

  // Independent HOLD: park the customer with no colleague. The agent's leg ends
  // when the customer is parked; the suppress guard keeps the call alive so the
  // modal shows the hold banner (state on_hold).
  const holdCall = useCallback(async () => {
    if (!organization?.id || !callIdRef.current || !canTransferCalls || transferSessionRef.current) return;
    console.log('[PERF] HOLD CLICK @', Math.round(performance.now()));
    // Muta o mic do atendente IMEDIATAMENTE (local/instantâneo): protege o ~1.5s
    // até o cliente ser parkeado, pra ele nunca escutar algo sem querer nesse
    // intervalo. No retomar, a nova perna volta desmutada (ver connectTransferCall).
    try { activeCallRef.current?.mute(true); } catch { /* leg pode já ter caído */ }
    try { incomingCallRef.current?.mute(true); } catch { /* idem */ }
    setIsMuted(true);
    setTransferLoading(true);
    setTransferOperation('starting');
    suppressCallFinalizationRef.current = true;
    transferOriginRef.current = activeIncomingCall || incomingCallRef.current ? 'incoming' : 'outgoing';
    // Provisional session set BEFORE the park so the agent-leg disconnect that
    // follows does not finalize the whole call.
    const provisional: CallTransferSession = {
      id: 'pending', callId: callIdRef.current, targetUserId: '', targetName: '',
      state: 'parking_customer', version: 0, consultationSequence: 1,
    };
    transferSessionRef.current = provisional;
    setTransferSession(provisional);
    try {
      const requestId = crypto.randomUUID();
      const { data, error } = await withTransferTimeout(supabase.functions.invoke('telephony-transfer-intent', {
        headers: { 'x-organization-id': organization.id },
        body: { callId: callIdRef.current, action: 'hold', requestId },
      }));
      if (error || data?.error || !data?.transferId) {
        throw new Error(data?.error || 'Não foi possível colocar em espera');
      }
      const session: CallTransferSession = {
        id: data.transferId, callId: callIdRef.current, targetUserId: '', targetName: '',
        state: (data.state || 'on_hold') as CallTransferState,
        version: data.version ?? 1, consultationSequence: data.consultationSequence ?? 1,
      };
      transferSessionRef.current = session;
      setTransferSession(session);
      subscribeToTransfer(data.transferId);
      console.log('[PERF] HOLD server done (cliente na fila) @', Math.round(performance.now()));
      toast.success('Cliente em espera.');
    } catch (error) {
      suppressCallFinalizationRef.current = false;
      transferSessionRef.current = null;
      setTransferSession(null);
      toast.error(transferErrorMessage(error));
    } finally {
      setTransferLoading(false);
      setTransferOperation(null);
    }
  }, [organization?.id, canTransferCalls, activeIncomingCall, subscribeToTransfer]);

  const controlTransfer = useCallback(async (
    action: 'return_to_customer' | 'consult_again' | 'complete' | 'cancel' | 'resume' | 'consult',
    options?: { targetUserId?: string; targetName?: string },
  ) => {
    const current = transferSessionRef.current;
    if (!organization?.id || !current) return;
    const preClick = current; // snapshot para reverter em caso de falha
    setTransferLoading(true);
    const operation: Record<typeof action, CallTransferOperation> = {
      return_to_customer: 'returning',
      resume: 'returning',
      consult_again: 'consulting_again',
      consult: 'consulting_again',
      complete: 'completing',
      cancel: 'canceling',
    };
    setTransferOperation(operation[action]);
    // Otimismo VISUAL: reflete o estado-alvo IMEDIATAMENTE (o modal responde na
    // hora) para o subconjunto seguro de ações. `complete` fica de fora de
    // propósito (interage com o handler de disconnect via handoff_pending) e
    // `cancel` limpa a sessão no caminho atual. O servidor segue sendo a verdade:
    // reconciliamos com a resposta e, em falha, revertemos (ver catch). O guard de
    // versão impede que um poll atrasado desfaça este estado.
    const optimisticTarget: Partial<Record<typeof action, CallTransferState>> = {
      resume: 'returning_to_customer',
      return_to_customer: 'returning_to_customer',
      consult: 'customer_queued',
      consult_again: 'customer_queued',
    };
    const targetState = optimisticTarget[action];
    if (targetState) {
      const optimistic: CallTransferSession = {
        ...current,
        state: targetState,
        version: (current.version ?? 0) + 1,
        targetUserId: options?.targetUserId ?? current.targetUserId,
        targetName: options?.targetName ?? current.targetName,
        error: null,
      };
      transferSessionRef.current = optimistic;
      setTransferSession(optimistic);
    }
    try {
      // Every action except `cancel` tears down / reconnects a Twilio leg; the
      // guard must be set BEFORE that so the SDK disconnect handler in makeCall
      // does not finalize the whole call as ended. `cancel` keeps the customer
      // leg and clears state, so it stays unsuppressed (reset below).
      if (action !== 'cancel') suppressCallFinalizationRef.current = true;
      const { data, error } = await withTransferTimeout(supabase.functions.invoke('telephony-transfer-control', {
        headers: { 'x-organization-id': organization.id },
        body: {
          transferId: current.id,
          action,
          expectedVersion: current.version,
          requestId: crypto.randomUUID(),
          // Only meaningful for consult_again: consult a DIFFERENT colleague.
          ...(options?.targetUserId ? { targetUserId: options.targetUserId } : {}),
        },
      }));
      if (error || data?.error) throw new Error(data?.error || 'Não foi possível controlar a transferência');
      const updated: CallTransferSession = {
        ...current,
        state: data.state as CallTransferState,
        version: data.version ?? current.version,
        consultationSequence: data.consultationSequence ?? current.consultationSequence,
        // Backend echoes the reclaimed target when consulting someone new.
        targetUserId: (data.targetUserId as string) ?? options?.targetUserId ?? current.targetUserId,
        targetName: options?.targetName ?? current.targetName,
        error: null,
      };
      transferSessionRef.current = updated;
      setTransferSession(updated);
      if (data.connectParams) {
        try {
          await connectTransferCall(data.connectParams as Record<string, string>, updated);
        } catch (connectError) {
          if (action === 'consult_again') {
            await recoverCustomerAfterConnectionFailure(updated);
          }
          throw connectError;
        }
      } else if (action === 'resume') {
        // Retomar religa a MESMA perna do atendente ao cliente no servidor (sem
        // re-discar): desmuta o mic e ENCERRA a sessão de espera. Espera é
        // INDEPENDENTE de transferência — voltamos ao estado normal da chamada e o
        // botão "Colocar em espera" reaparece (não fica preso em with_customer).
        try { activeCallRef.current?.mute(false); } catch { /* noop */ }
        try { incomingCallRef.current?.mute(false); } catch { /* noop */ }
        setIsMuted(false);
        suppressCallFinalizationRef.current = false;
        transferConnectGenerationRef.current += 1;
        transferSessionRef.current = null;
        setTransferSession(null);
        if (transferChannelRef.current) {
          supabase.removeChannel(transferChannelRef.current);
          transferChannelRef.current = null;
        }
        toast.success('De volta com o cliente.');
      }
      if (action === 'complete') toast.success(`Transferindo para ${current.targetName}`);
      if (action === 'return_to_customer') toast.success('Voltando para o cliente');
      if (action === 'cancel') {
        suppressCallFinalizationRef.current = false;
        transferConnectGenerationRef.current += 1;
        transferSessionRef.current = null;
        setTransferSession(null);
        if (transferChannelRef.current) {
          supabase.removeChannel(transferChannelRef.current);
          transferChannelRef.current = null;
        }
        toast.success('Modo de transferência encerrado; você continua com o cliente.');
      }
    } catch (error) {
      const message = transferErrorMessage(error);
      toast.error(message);
      // Reverter o otimismo: volta ao snapshot pré-clique ANTES de reconciliar —
      // senão o guard de versão bloquearia uma releitura de versão menor (ex.: o
      // backend nem chegou a commitar). Em seguida reconcilia com a linha real.
      transferSessionRef.current = preClick;
      setTransferSession(preClick);
      const { data: refreshed } = await telephonySupabase.from('call_transfers')
        .select('state, version, consultation_sequence, failure_reason')
        .eq('id', preClick.id).maybeSingle();
      if (refreshed?.state) {
        applyTransferUpdate({
          state: refreshed.state as CallTransferState,
          version: refreshed.version,
          consultation_sequence: refreshed.consultation_sequence,
          failure_reason: refreshed.failure_reason || message,
        });
      } else {
        setTransferSession((session) => session ? { ...session, error: message } : session);
      }
    } finally {
      setTransferLoading(false);
      setTransferOperation(null);
    }
  }, [organization?.id, connectTransferCall, recoverCustomerAfterConnectionFailure, applyTransferUpdate]);

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
      console.log('[PERF] CALL connect() @', Math.round(performance.now()), 'deviceReady=', isDeviceReady && !!deviceRef.current);
      if (isDeviceReady && deviceRef.current) {
        console.log('Device ready, starting call immediately');
        makeCall();
      } else {
        console.log('Device not ready, initializing...');
        initializeDevice();
      }
    };
    if (replacingActiveCall && deviceRef.current) {
      void closeTransferLegs(deviceRef.current, [
        transferCallRef.current,
        activeCallRef.current,
        incomingCallRef.current,
      ]).then(connect).catch((closeError) => {
        const message = transferErrorMessage(closeError);
        setErrorMessage(message);
        toast.error(message);
      });
    } else if (replacingActiveCall) {
      // No live Device leg to coordinate yet: Twilio still closes the previous
      // browser leg asynchronously, so give it a short window before reconnecting.
      window.setTimeout(connect, 350);
    } else connect();
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

  // Always-available escape so a stuck/transitional transfer state can never
  // trap the agent behind a spinner. Chooses the safe exit for the state:
  //  - reachable "soft" states -> return the customer to the initiator;
  //  - resting with_customer   -> cancel the hold (agent keeps the customer);
  //  - transient states with no soft return -> end the call outright.
  const escapeTransfer = useCallback(async () => {
    const current = transferSessionRef.current;
    if (!current) return;
    const state = current.state;
    if (state === 'on_hold') {
      await controlTransfer('resume');
      return;
    }
    if (['consulting', 'consult_ringing', 'customer_queued'].includes(state)) {
      await controlTransfer('return_to_customer');
      return;
    }
    if (state === 'with_customer') {
      await controlTransfer('cancel');
      return;
    }
    // parking_customer | returning_to_customer | handoff_pending (or unknown):
    // no soft return exists; end_call is the guaranteed exit.
    if (transferOriginRef.current === 'incoming') endIncomingCall();
    else endCall();
  }, [controlTransfer, endCall, endIncomingCall]);

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
    transferOperation,
    audioReconnecting,
    loadTransferTargets,
    startTransfer,
    holdCall,
    controlTransfer,
    escapeTransfer,
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
