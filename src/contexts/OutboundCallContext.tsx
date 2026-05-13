import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Device, Call } from '@twilio/voice-sdk';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';


export type CallStatus = 'idle' | 'initializing' | 'ready' | 'connecting' | 'ringing' | 'connected' | 'ended' | 'failed';

interface CallInfo {
  phoneNumber: string;
  contactName?: string;
  contactId?: string;
  opportunityId?: string;
}

interface TokenCache {
  token: string;
  expires: number;
}

interface OutboundCallContextType {
  // Start a call
  startCall: (params: CallInfo) => void;
  
  // Call state
  isOnCall: boolean;
  callInfo: CallInfo | null;
  status: CallStatus;
  duration: number;
  errorMessage: string | null;
  
  // Controls
  endCall: () => void;
  toggleMute: () => void;
  isMuted: boolean;
  sendDTMF: (digit: string) => void;
  dtmfDigits: string;
  
  // UI state
  isMinimized: boolean;
  setMinimized: (val: boolean) => void;
  
  // Device state
  isDeviceReady: boolean;
}

const OutboundCallContext = createContext<OutboundCallContextType | undefined>(undefined);

export function OutboundCallProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
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
  
  // SECURITY: Never initialize in admin routes
  const isAdminRoute = location.pathname.startsWith('/admin');
  
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
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

  const isOnCall = status !== 'idle' && status !== 'failed' && status !== 'ended';

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

    // Ensure session is fresh (auto-refreshes expired JWT) before invoking
    const { data: sess } = await supabase.auth.getSession();
    if (!sess?.session?.access_token) {
      throw new Error('Não autenticado');
    }

    const { data: tokenData, error: tokenError } = await supabase.functions.invoke('twilio-token');

    if (tokenError || !tokenData?.token) {
      console.warn('Token error:', tokenError?.message || tokenError);
      throw new Error('Erro ao obter token de acesso');
    }

    // Cache token for 1 hour
    tokenCacheRef.current = {
      token: tokenData.token,
      expires: now + 3600000, // 1 hour
    };

    console.log('Token fetched and cached');
    return tokenData.token;
  }, []);

  // Get cached user data or fetch it
  const getUserData = useCallback(async () => {
    if (userDataCacheRef.current) {
      return userDataCacheRef.current;
    }

    const { data: userData } = await supabase.auth.getUser();
    const { data: userProfile } = await supabase
      .from('users')
      .select('id')
      .eq('auth_user_id', userData.user?.id)
      .single();

    const { data: userOrg } = await supabase
      .from('user_organizations')
      .select('organization_id')
      .eq('user_id', userProfile?.id)
      .eq('is_active', true)
      .single();

    if (userOrg && userProfile) {
      userDataCacheRef.current = {
        userId: userProfile.id,
        orgId: userOrg.organization_id,
      };
      return userDataCacheRef.current;
    }

    return null;
  }, []);

  // Cleanup call state only (keep device)
  const cleanupCall = useCallback(() => {
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
    setIsMinimized(false);
    callIdRef.current = null;
    callStartTimeRef.current = null;
    pendingCallRef.current = null;
    callFinalizedRef.current = false;
    lastProcessedStatusRef.current = null;
  }, [isDeviceReady, clearStateTimeout, unsubscribeFromCallStatus]);

  // Keep ref in sync so realtime subscription can call cleanupCall without a circular dep
  cleanupCallRef.current = cleanupCall;

  // Full cleanup (including device)
  const fullCleanup = useCallback(() => {
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
  }, []);

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
        .update(updateData)
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
        console.log('Call record created with ID:', newCall.id);
        // Subscribe to server-side status updates (dual-path sync)
        subscribeToCallStatus(newCall.id);
      }
    } catch (dbError) {
      console.error('Error recording call:', dbError);
    }
  }, [getUserData]);

  // Make the actual call (fast path - device already ready)
  const makeCall = useCallback(async () => {
    if (!deviceRef.current || !pendingCallRef.current) {
      console.log('Device or pending call not ready');
      return;
    }

    const { phoneNumber, contactId, opportunityId } = pendingCallRef.current;

    try {
      setStatus('connecting');
      console.log('Connecting call to:', phoneNumber);

      // Timeout: if not ringing within 15s, something is wrong
      setStateTimeout(15000, 'Tempo esgotado ao conectar chamada');

      // Start call record creation in PARALLEL (non-blocking)
      createCallRecordAsync(phoneNumber, contactId, opportunityId);

      // Connect the call IMMEDIATELY
      const call = await deviceRef.current.connect({
        params: {
          To: phoneNumber,
        },
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
        callFinalizedRef.current = true;
        lastProcessedStatusRef.current = 'completed';
        clearStateTimeout();
        setStatus('ended');
        updateCallRecord('completed', new Date());
      });

      call.on('cancel', () => {
        console.log('[SDK] Call cancelled');
        callFinalizedRef.current = true;
        lastProcessedStatusRef.current = 'canceled';
        clearStateTimeout();
        setStatus('ended');
        updateCallRecord('canceled', new Date());
      });

      call.on('reject', () => {
        console.log('[SDK] Call rejected');
        callFinalizedRef.current = true;
        lastProcessedStatusRef.current = 'busy';
        clearStateTimeout();
        setStatus('failed');
        setErrorMessage('Chamada rejeitada');
        updateCallRecord('busy', new Date());
      });

      call.on('error', (error) => {
        console.error('[SDK] Call error:', error);
        callFinalizedRef.current = true;
        lastProcessedStatusRef.current = 'failed';
        clearStateTimeout();
        setErrorMessage(error.message || 'Erro na chamada');
        setStatus('failed');
        updateCallRecord('failed', new Date());
      });

    } catch (error: any) {
      console.error('Call connection error:', error);
      clearStateTimeout();
      setErrorMessage(error.message || 'Erro ao conectar chamada');
      setStatus('failed');
    }
  }, [updateCallRecord, createCallRecordAsync]);

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

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        console.log('Not authenticated, skipping device initialization');
        isInitializingRef.current = false;
        setStatus('idle');
        return;
      }

      const token = await getToken();
      console.log('Got access token, initializing persistent device...');

      const device = new Device(token, {
        codecPreferences: [Call.Codec.PCMU, Call.Codec.Opus],
        allowIncomingWhileBusy: false,
      });

      device.on('registered', () => {
        console.log('Twilio Device registered and ready');
        setStatus('ready');
        setIsDeviceReady(true);
        isInitializingRef.current = false;
      });

      device.on('error', (error) => {
        console.error('Twilio Device error:', error);
        setErrorMessage(error.message || 'Erro no dispositivo de áudio');
        setStatus('failed');
        setIsDeviceReady(false);
        isInitializingRef.current = false;
      });

      device.on('unregistered', () => {
        console.log('Twilio Device unregistered');
        setIsDeviceReady(false);
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
  }, [getToken, getUserData]);

  // Check voice integration availability (inline, no external context dependency)
  useEffect(() => {
    if (isAdminRoute) {
      setVoiceLoading(false);
      return;
    }
    let cancelled = false;
    const check = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.access_token || cancelled) {
          setVoiceLoading(false);
          return;
        }
        // Get user's org
        const { data: userData } = await supabase
          .from('users')
          .select('id')
          .eq('auth_user_id', session.session.user.id)
          .maybeSingle();
        if (!userData || cancelled) { setVoiceLoading(false); return; }
        
        const { data: orgData } = await supabase
          .from('user_organizations')
          .select('organization_id')
          .eq('user_id', userData.id)
          .eq('is_active', true)
          .maybeSingle();
        if (!orgData || cancelled) { setVoiceLoading(false); return; }

        const { data } = await supabase
          .from('organization_integrations')
          .select('id, admin_integrations!inner(slug, category)')
          .eq('organization_id', orgData.organization_id)
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
  }, [isAdminRoute]);

  // Initialize device on mount (persistent)
  // CRITICAL SECURITY: Never initialize in admin portal or without auth or without voice integration
  useEffect(() => {
    // Skip initialization in admin routes
    if (isAdminRoute) {
      console.log('[OutboundCall] Skipping initialization in admin route');
      return;
    }

    // Skip if voice integration is not enabled or still loading
    if (voiceLoading || !hasVoiceIntegration) {
      console.log('[OutboundCall] Voice integration not enabled, skipping device initialization');
      return;
    }
    
    let timer: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;
    
    // Check auth before initializing
    const checkAuthAndInitialize = async () => {
      try {
        const { data: session } = await supabase.auth.getSession();
        if (!session?.session?.access_token) {
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
  }, [isAdminRoute, hasVoiceIntegration, voiceLoading]);

  // Start a new call
  const startCall = useCallback((params: CallInfo) => {
    // Clean up any existing call first (but keep device)
    if (isOnCall) {
      cleanupCall();
    }
    
    setCallInfo(params);
    pendingCallRef.current = params;

    // If device is ready, start call immediately
    if (isDeviceReady && deviceRef.current) {
      console.log('Device ready, starting call immediately');
      makeCall();
    } else {
      // Device not ready, initialize it first
      console.log('Device not ready, initializing...');
      initializeDevice();
    }
  }, [isOnCall, cleanupCall, isDeviceReady, makeCall, initializeDevice]);

  // End the current call
  const endCall = useCallback(() => {
    clearStateTimeout();

    if (activeCallRef.current) {
      try {
        activeCallRef.current.disconnect();
      } catch (e) {
        console.warn('[OutboundCall] Error disconnecting call:', e);
      }
    }
    setStatus('ended');
    updateCallRecord('completed', new Date());

    // Force cleanup after short delay — don't wait for disconnect event
    setTimeout(() => {
      activeCallRef.current = null;
      cleanupCall();
    }, 1500);
  }, [cleanupCall, clearStateTimeout, updateCallRecord]);

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
  };

  return (
    <OutboundCallContext.Provider value={value}>
      {children}
    </OutboundCallContext.Provider>
  );
}

export function useOutboundCall() {
  const context = useContext(OutboundCallContext);
  if (context === undefined) {
    throw new Error('useOutboundCall must be used within an OutboundCallProvider');
  }
  return context;
}
