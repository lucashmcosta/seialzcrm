import React, { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
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
}

const OutboundCallContext = createContext<OutboundCallContextType | undefined>(undefined);

export function OutboundCallProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<CallStatus>('idle');
  const [callInfo, setCallInfo] = useState<CallInfo | null>(null);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [dtmfDigits, setDtmfDigits] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isMinimized, setIsMinimized] = useState(false);
  
  const deviceRef = useRef<Device | null>(null);
  const activeCallRef = useRef<Call | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const callIdRef = useRef<string | null>(null);
  const callStartTimeRef = useRef<Date | null>(null);
  const pendingCallRef = useRef<CallInfo | null>(null);

  const isOnCall = status !== 'idle' && status !== 'failed' && status !== 'ended';

  // Cleanup function
  const cleanup = useCallback(() => {
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
    callIdRef.current = null;
    callStartTimeRef.current = null;
    pendingCallRef.current = null;
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

  // Make the actual call
  const makeCall = useCallback(async () => {
    if (!deviceRef.current || !pendingCallRef.current) {
      console.log('Device or pending call not ready');
      return;
    }

    const { phoneNumber, contactId, opportunityId } = pendingCallRef.current;

    try {
      setStatus('connecting');
      console.log('Connecting call to:', phoneNumber);

      // Create call record BEFORE connecting
      try {
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
          callStartTimeRef.current = new Date();
          
          const { data: newCall } = await supabase.from('calls').insert({
            organization_id: userOrg.organization_id,
            user_id: userProfile.id,
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
        }
      } catch (dbError) {
        console.error('Error recording call:', dbError);
      }

      // Connect the call
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
  }, [updateCallRecord]);

  // Initialize device
  const initializeDevice = useCallback(async () => {
    try {
      setStatus('initializing');
      setErrorMessage(null);

      const { data: session } = await supabase.auth.getSession();
      if (!session?.session?.access_token) {
        throw new Error('Não autenticado');
      }

      const { data: tokenData, error: tokenError } = await supabase.functions.invoke('twilio-token');

      if (tokenError || !tokenData?.token) {
        console.error('Token error:', tokenError);
        throw new Error('Erro ao obter token de acesso');
      }

      console.log('Got access token, initializing device...');

      const device = new Device(tokenData.token, {
        codecPreferences: [Call.Codec.PCMU, Call.Codec.Opus],
        allowIncomingWhileBusy: false,
      });

      device.on('registered', () => {
        console.log('Twilio Device registered');
        setStatus('ready');
      });

      device.on('error', (error) => {
        console.error('Twilio Device error:', error);
        setErrorMessage(error.message || 'Erro no dispositivo de áudio');
        setStatus('failed');
      });

      device.on('unregistered', () => {
        console.log('Twilio Device unregistered');
      });

      await device.register();
      deviceRef.current = device;

    } catch (error: any) {
      console.error('Device initialization error:', error);
      setErrorMessage(error.message || 'Erro ao inicializar chamada');
      setStatus('failed');
    }
  }, []);

  // Start a new call
  const startCall = useCallback((params: CallInfo) => {
    // Clean up any existing call first
    if (isOnCall) {
      cleanup();
    }
    
    setCallInfo(params);
    pendingCallRef.current = params;
    initializeDevice();
  }, [isOnCall, cleanup, initializeDevice]);

  // End the current call
  const endCall = useCallback(() => {
    if (activeCallRef.current) {
      activeCallRef.current.disconnect();
    }
    setStatus('ended');
    
    // Cleanup after a short delay to show "ended" state
    setTimeout(() => {
      cleanup();
    }, 1500);
  }, [cleanup]);

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

  // Effect: Make call when device is ready
  useEffect(() => {
    if (status === 'ready' && pendingCallRef.current) {
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
