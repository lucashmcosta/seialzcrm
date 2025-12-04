import { useState, useEffect, useRef, useCallback } from 'react';
import { Device, Call } from '@twilio/voice-sdk';
import { supabase } from '@/integrations/supabase/client';
import { useOrganization } from './useOrganization';

interface InboundCallInfo {
  call: Call;
  from: string;
  contactName?: string;
  contactId?: string;
}

interface UseInboundCallsReturn {
  isReady: boolean;
  incomingCall: InboundCallInfo | null;
  answerCall: () => void;
  rejectCall: () => void;
  isOnCall: boolean;
  activeCall: Call | null;
  endCall: () => void;
  toggleMute: () => void;
  isMuted: boolean;
}

export function useInboundCalls(): UseInboundCallsReturn {
  const { organization, userProfile } = useOrganization();
  const [isReady, setIsReady] = useState(false);
  const [incomingCall, setIncomingCall] = useState<InboundCallInfo | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const deviceRef = useRef<Device | null>(null);

  // Check if user should receive calls
  const checkUserShouldReceiveCalls = useCallback(async (): Promise<boolean> => {
    if (!organization?.id || !userProfile?.id) return false;

    try {
      // First check if organization has voice integration enabled
      const { data: integration } = await supabase
        .from('organization_integrations')
        .select(`
          is_enabled,
          admin_integrations!inner(slug, category)
        `)
        .eq('organization_id', organization.id)
        .eq('is_enabled', true)
        .eq('admin_integrations.category', 'telephony')
        .single();

      if (!integration) return false;

      // Check phone number configuration
      const { data: phoneConfig } = await supabase
        .from('organization_phone_numbers')
        .select('ring_strategy, ring_users')
        .eq('organization_id', organization.id)
        .eq('is_primary', true)
        .single();

      if (!phoneConfig) return false;

      // If ring_strategy is 'all', user should receive calls
      if (phoneConfig.ring_strategy === 'all') return true;

      // If ring_strategy is 'specific_users', check if user is in ring_users
      if (phoneConfig.ring_strategy === 'specific_users' || phoneConfig.ring_strategy === 'round_robin') {
        const ringUsers = phoneConfig.ring_users as string[] || [];
        return ringUsers.includes(userProfile.id);
      }

      return false;
    } catch (error) {
      console.error('Error checking user call permissions:', error);
      return false;
    }
  }, [organization?.id, userProfile?.id]);

  // Initialize Twilio Device for receiving calls
  const initializeDevice = useCallback(async () => {
    if (!organization?.id || !userProfile?.id) return;

    try {
      // Check if user should receive calls
      const shouldReceive = await checkUserShouldReceiveCalls();
      if (!shouldReceive) {
        console.log('User not configured to receive inbound calls');
        return;
      }

      // Get access token - use user ID as identity for inbound calls
      const { data, error } = await supabase.functions.invoke('twilio-token', {
        body: { 
          organizationId: organization.id,
          identity: userProfile.id // Use user ID as client identity
        }
      });

      if (error || !data?.token) {
        console.error('Failed to get Twilio token for inbound calls:', error);
        return;
      }

      // Create and register device
      const device = new Device(data.token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });

      device.on('registered', () => {
        console.log('Twilio Device registered for inbound calls');
        setIsReady(true);
      });

      device.on('error', (error) => {
        console.error('Twilio Device error:', error);
        setIsReady(false);
      });

      device.on('incoming', async (call: Call) => {
        console.log('Incoming call from:', call.parameters.From);
        
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

        // Handle call disconnect
        call.on('disconnect', () => {
          console.log('Incoming call disconnected');
          setIncomingCall(null);
          setActiveCall(null);
          setIsMuted(false);
        });

        call.on('cancel', () => {
          console.log('Incoming call cancelled');
          setIncomingCall(null);
        });
      });

      await device.register();
      deviceRef.current = device;

    } catch (error) {
      console.error('Error initializing inbound call device:', error);
    }
  }, [organization?.id, userProfile?.id, checkUserShouldReceiveCalls]);

  // Answer incoming call
  const answerCall = useCallback(() => {
    if (incomingCall?.call) {
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

  // Initialize on mount
  useEffect(() => {
    initializeDevice();

    return () => {
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, [initializeDevice]);

  return {
    isReady,
    incomingCall,
    answerCall,
    rejectCall,
    isOnCall: !!activeCall,
    activeCall,
    endCall,
    toggleMute,
    isMuted
  };
}
