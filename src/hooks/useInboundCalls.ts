import { useState, useEffect, useRef, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Device, Call } from '@twilio/voice-sdk';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';
import { useVoiceIntegration } from './useVoiceIntegration';

interface InboundCallInfo {
  call: Call;
  from: string;
  contactName?: string;
  contactId?: string;
}

interface ActiveCallInfo {
  from: string;
  contactName?: string;
  contactId?: string;
}

interface UseInboundCallsReturn {
  isReady: boolean;
  incomingCall: InboundCallInfo | null;
  activeCallInfo: ActiveCallInfo | null;
  answerCall: () => void;
  rejectCall: () => void;
  isOnCall: boolean;
  activeCall: Call | null;
  endCall: () => void;
  toggleMute: () => void;
  isMuted: boolean;
}

export function useInboundCalls(): UseInboundCallsReturn {
  const location = useLocation();
  const { organization, userProfile } = useOrganization();
  const { hasVoiceIntegration, loading: voiceLoading } = useVoiceIntegration();
  const [isReady, setIsReady] = useState(false);
  const [incomingCall, setIncomingCall] = useState<InboundCallInfo | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [activeCallInfo, setActiveCallInfo] = useState<ActiveCallInfo | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const deviceRef = useRef<Device | null>(null);
  
  // SECURITY: Never initialize in admin routes
  const isAdminRoute = location.pathname.startsWith('/admin');

  // Check if user should receive calls
  const checkUserShouldReceiveCalls = useCallback(async (): Promise<boolean> => {
    if (!organization?.id || !userProfile?.id) {
      return false;
    }

    try {
      // SECURITY: First verify user is an active member of the current organization
      const { data: membership } = await supabase
        .from('user_organizations')
        .select('is_active')
        .eq('user_id', userProfile.id)
        .eq('organization_id', organization.id)
        .eq('is_active', true)
        .single();
      
      if (!membership) {
        console.log('[InboundCalls] User not active member of current organization');
        return false;
      }

      // Check phone number configuration
      const { data: phoneConfig } = await supabase
        .from('organization_phone_numbers')
        .select('ring_strategy, ring_users')
        .eq('organization_id', organization.id)
        .eq('is_primary', true)
        .single();

      if (!phoneConfig) {
        return false;
      }

      // If ring_strategy is 'all', user should receive calls
      if (phoneConfig.ring_strategy === 'all') {
        return true;
      }

      // If ring_strategy is 'specific_users', check if user is in ring_users
      if (phoneConfig.ring_strategy === 'specific_users' || phoneConfig.ring_strategy === 'round_robin') {
        const ringUsers = phoneConfig.ring_users as string[] || [];
        return ringUsers.includes(userProfile.id);
      }

      return false;
    } catch (error) {
      console.error('[InboundCalls] Error checking user call permissions:', error);
      return false;
    }
  }, [organization?.id, userProfile?.id]);

  // Initialize Twilio Device for receiving calls
  const initializeDevice = useCallback(async () => {
    if (!organization?.id || !userProfile?.id) {
      return;
    }

    try {
      // Check if user should receive calls
      const shouldReceive = await checkUserShouldReceiveCalls();
      
      if (!shouldReceive) {
        return;
      }

      // Get access token
      const { data, error } = await supabase.functions.invoke('twilio-token', {
        body: { 
          organizationId: organization.id,
          identity: userProfile.id
        }
      });

      if (error || !data?.token) {
        console.error('[InboundCalls] Failed to get Twilio token:', error);
        return;
      }

      // Create and register device
      const device = new Device(data.token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });

      device.on('registered', () => {
        setIsReady(true);
      });

      device.on('unregistered', () => {
        setIsReady(false);
      });

      device.on('error', (error) => {
        console.error('[InboundCalls] Device error:', error);
        setIsReady(false);
      });

      device.on('incoming', async (call: Call) => {
        // Try to find contact by phone number
        let contactName: string | undefined;
        let contactId: string | undefined;
        
        const fromNumber = call.parameters.From;
        if (fromNumber && organization?.id) {
          const { data: contact } = await supabase
            .from('contacts')
            .select('id, full_name')
            .eq('organization_id', organization.id)
            .or(`phone.eq.${fromNumber},phone.eq.${fromNumber.replace('+55', '')}`)
            .is('deleted_at', null)
            .single();
          
          if (contact) {
            contactName = contact.full_name;
            contactId = contact.id;
          }
        }

        setIncomingCall({
          call,
          from: fromNumber || 'Número desconhecido',
          contactName,
          contactId
        });

        call.on('disconnect', () => {
          setIncomingCall(null);
          setActiveCall(null);
          setActiveCallInfo(null);
          setIsMuted(false);
        });

        call.on('cancel', () => {
          setIncomingCall(null);
        });

        call.on('reject', () => {
          setIncomingCall(null);
        });
      });

      await device.register();
      deviceRef.current = device;

    } catch (error) {
      console.error('[InboundCalls] Error initializing device:', error);
    }
  }, [organization?.id, userProfile?.id, checkUserShouldReceiveCalls]);

  // Answer incoming call
  const answerCall = useCallback(() => {
    if (incomingCall?.call) {
      setActiveCallInfo({
        from: incomingCall.from,
        contactName: incomingCall.contactName,
        contactId: incomingCall.contactId
      });
      
      incomingCall.call.accept();
      setActiveCall(incomingCall.call);
      setIncomingCall(null);
    }
  }, [incomingCall]);

  // Reject incoming call
  const rejectCall = useCallback(() => {
    if (incomingCall?.call) {
      incomingCall.call.reject();
      setIncomingCall(null);
    }
  }, [incomingCall]);

  // End active call
  const endCall = useCallback(() => {
    if (activeCall) {
      activeCall.disconnect();
      setActiveCall(null);
      setActiveCallInfo(null);
      setIsMuted(false);
    }
  }, [activeCall]);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (activeCall) {
      const newMuteState = !isMuted;
      activeCall.mute(newMuteState);
      setIsMuted(newMuteState);
    }
  }, [activeCall, isMuted]);

  // Only initialize if voice integration is active and NOT in admin route
  useEffect(() => {
    if (voiceLoading) return;
    
    // CRITICAL SECURITY: Never initialize in admin portal
    if (isAdminRoute) {
      console.log('[InboundCalls] Skipping initialization in admin route');
      return;
    }
    
    // Skip initialization if no voice integration
    if (!hasVoiceIntegration) {
      return;
    }

    // Skip if no organization or user profile (not authenticated)
    if (!organization?.id || !userProfile?.id) {
      console.log('[InboundCalls] Skipping initialization - user not authenticated');
      return;
    }

    initializeDevice();

    return () => {
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, [initializeDevice, hasVoiceIntegration, voiceLoading, isAdminRoute, organization?.id, userProfile?.id]);

  return {
    isReady,
    incomingCall,
    activeCallInfo,
    answerCall,
    rejectCall,
    isOnCall: !!activeCall,
    activeCall,
    endCall,
    toggleMute,
    isMuted
  };
}
