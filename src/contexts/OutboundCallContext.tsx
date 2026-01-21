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
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<Date | null>(null);
  const pendingCallRef = useRef<CallInfo | null>(null);
  const tokenCacheRef = useRef<TokenCache | null>(null);
  const userDataCacheRef = useRef<{ userId: string; orgId: string } | null>(null);
  const isInitializingRef = useRef(false);

  const isOnCall = status !== 'idle' && status !== 'failed' && status !== 'ended';

  // Get cached token or fetch new one
  const getToken = useCallback(async (): Promise<string> => {
    const now = Date.now();
    
    // Return cached token if still valid (with 1 minute buffer)
    if (tokenCacheRef.current && tokenCacheRef.current.expires > now + 60000) {
      console.log('Using cached token');
      return tokenCacheRef.current.token;
    }

    const { data: tokenData, error: tokenError } = await supabase.functions.invoke('twilio-token');

    if (tokenError || !tokenData?.token) {
      console.error('Token error:', tokenError);
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
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
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
  }, [isDeviceReady]);

  // Full cleanup (including device)
  const fullCleanup = useCallback(() => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
      activeCallRef.current = null;
    }
    if (deviceRef.current) {
      deviceRef.current.destroy();
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
    callIdRef.current = null;
    callStartTimeRef.current = null;
    pendingCallRef.current = null;
    tokenCacheRef.current = null;
    userDataCacheRef.current = null;
    isInitializingRef.current = false;
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
        console.log('Call ringing');
        setStatus('ringing');
        updateCallRecord('ringing');
      });

      call.on('accept', () => {
        console.log('Call accepted/connected');
        setStatus('connected');
        updateCallRecord('in-progress');
        toast.success('Chamada conectada');
      });

      call.on('disconnect', () => {
        console.log('Call disconnected');
        setStatus('ended');
        updateCallRecord('completed', new Date());
      });

      call.on('cancel', () => {
        console.log('Call cancelled');
        setStatus('ended');
        updateCallRecord('canceled', new Date());
      });

      call.on('reject', () => {
        console.log('Call rejected');
        setStatus('failed');
        setErrorMessage('Chamada rejeitada');
        updateCallRecord('busy', new Date());
      });

      call.on('error', (error) => {
        console.error('Call error:', error);
        setErrorMessage(error.message || 'Erro na chamada');
        setStatus('failed');
        updateCallRecord('failed', new Date());
      });

    } catch (error: any) {
      console.error('Call connection error:', error);
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

  // Initialize device on mount (persistent)
  // CRITICAL SECURITY: Never initialize in admin portal or without auth
  useEffect(() => {
    // Skip initialization in admin routes
    if (isAdminRoute) {
      console.log('[OutboundCall] Skipping initialization in admin route');
      return;
    }
    
    let timer: NodeJS.Timeout | null = null;
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
  }, [isAdminRoute]);

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
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    }
    setStatus('ended');
    
    // Cleanup after a short delay to show "ended" state
    setTimeout(() => {
      cleanupCall();
    }, 1500);
  }, [cleanupCall]);

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
