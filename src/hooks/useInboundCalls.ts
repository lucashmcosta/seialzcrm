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
  const { organization, userProfile } = useOrganization();
  const [isReady, setIsReady] = useState(false);
  const [incomingCall, setIncomingCall] = useState<InboundCallInfo | null>(null);
  const [activeCall, setActiveCall] = useState<Call | null>(null);
  const [activeCallInfo, setActiveCallInfo] = useState<ActiveCallInfo | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const deviceRef = useRef<Device | null>(null);

  // Check if user should receive calls
  const checkUserShouldReceiveCalls = useCallback(async (): Promise<boolean> => {
    if (!organization?.id || !userProfile?.id) {
      console.log('[InboundCalls] Missing org or user:', { orgId: organization?.id, userId: userProfile?.id });
      return false;
    }

    try {
      console.log('[InboundCalls] Checking if user should receive calls...');
      console.log('[InboundCalls] Organization ID:', organization.id);
      console.log('[InboundCalls] User ID:', userProfile.id);

      // Step 1: Find Twilio Voice integration by slug (more reliable than category)
      const { data: twilioIntegration, error: integrationError } = await supabase
        .from('admin_integrations')
        .select('id, slug, category')
        .eq('slug', 'twilio-voice')
        .single();

      console.log('[InboundCalls] Twilio integration lookup:', { data: twilioIntegration, error: integrationError });

      if (!twilioIntegration) {
        console.log('[InboundCalls] Twilio Voice integration not found in admin_integrations');
        return false;
      }

      // Step 2: Check if organization has this integration enabled
      const { data: orgIntegration, error: orgIntError } = await supabase
        .from('organization_integrations')
        .select('is_enabled, config_values')
        .eq('organization_id', organization.id)
        .eq('integration_id', twilioIntegration.id)
        .eq('is_enabled', true)
        .single();

      console.log('[InboundCalls] Organization integration:', { data: orgIntegration, error: orgIntError });

      if (!orgIntegration) {
        console.log('[InboundCalls] Organization does not have Twilio Voice enabled');
        return false;
      }

      // Check phone number configuration
      const { data: phoneConfig, error: phoneError } = await supabase
        .from('organization_phone_numbers')
        .select('ring_strategy, ring_users')
        .eq('organization_id', organization.id)
        .eq('is_primary', true)
        .single();

      console.log('[InboundCalls] Phone config:', { data: phoneConfig, error: phoneError });

      if (!phoneConfig) {
        console.log('[InboundCalls] No primary phone number configured');
        return false;
      }

      // If ring_strategy is 'all', user should receive calls
      if (phoneConfig.ring_strategy === 'all') {
        console.log('[InboundCalls] Ring strategy is "all" - user will receive calls');
        return true;
      }

      // If ring_strategy is 'specific_users', check if user is in ring_users
      if (phoneConfig.ring_strategy === 'specific_users' || phoneConfig.ring_strategy === 'round_robin') {
        const ringUsers = phoneConfig.ring_users as string[] || [];
        const userIncluded = ringUsers.includes(userProfile.id);
        console.log('[InboundCalls] Ring users check:', { ringUsers, userIncluded });
        return userIncluded;
      }

      console.log('[InboundCalls] Unknown ring strategy:', phoneConfig.ring_strategy);
      return false;
    } catch (error) {
      console.error('[InboundCalls] Error checking user call permissions:', error);
      return false;
    }
  }, [organization?.id, userProfile?.id]);

  // Initialize Twilio Device for receiving calls
  const initializeDevice = useCallback(async () => {
    if (!organization?.id || !userProfile?.id) {
      console.log('[InboundCalls] Cannot initialize - missing org or user');
      return;
    }

    try {
      console.log('[InboundCalls] Starting device initialization...');
      
      // Check if user should receive calls
      const shouldReceive = await checkUserShouldReceiveCalls();
      console.log('[InboundCalls] Should receive calls:', shouldReceive);
      
      if (!shouldReceive) {
        console.log('[InboundCalls] User not configured to receive inbound calls - skipping device init');
        return;
      }

      console.log('[InboundCalls] Requesting Twilio token...');
      
      // Get access token - use user ID as identity for inbound calls
      const { data, error } = await supabase.functions.invoke('twilio-token', {
        body: { 
          organizationId: organization.id,
          identity: userProfile.id // Use user ID as client identity
        }
      });

      if (error || !data?.token) {
        console.error('[InboundCalls] Failed to get Twilio token:', error, data);
        return;
      }

      console.log('[InboundCalls] Token received successfully, identity:', data.identity || userProfile.id);
      console.log('[InboundCalls] Creating Twilio Device...');

      // Create and register device
      const device = new Device(data.token, {
        logLevel: 1,
        codecPreferences: [Call.Codec.Opus, Call.Codec.PCMU],
      });

      device.on('registering', () => {
        console.log('[InboundCalls] Device registering...');
      });

      device.on('registered', () => {
        console.log('[InboundCalls] ✅ Device registered successfully - ready to receive calls!');
        setIsReady(true);
      });

      device.on('unregistered', () => {
        console.log('[InboundCalls] Device unregistered');
        setIsReady(false);
      });

      device.on('error', (error) => {
        console.error('[InboundCalls] ❌ Device error:', error);
        setIsReady(false);
      });

      device.on('tokenWillExpire', () => {
        console.log('[InboundCalls] Token will expire soon - should refresh');
        // TODO: Implement token refresh
      });

      device.on('incoming', async (call: Call) => {
        console.log('[InboundCalls] 📞 INCOMING CALL!');
        console.log('[InboundCalls] From:', call.parameters.From);
        console.log('[InboundCalls] Call SID:', call.parameters.CallSid);
        
        // Try to find contact by phone number
        let contactName: string | undefined;
        let contactId: string | undefined;
        
        const fromNumber = call.parameters.From;
        if (fromNumber && organization?.id) {
          console.log('[InboundCalls] Looking up contact for number:', fromNumber);
          
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
            console.log('[InboundCalls] Contact found:', contactName);
          } else {
            console.log('[InboundCalls] No contact found for this number');
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
          console.log('[InboundCalls] Call disconnected');
          setIncomingCall(null);
          setActiveCall(null);
          setActiveCallInfo(null);
          setIsMuted(false);
        });

        call.on('cancel', () => {
          console.log('[InboundCalls] Call cancelled by caller');
          setIncomingCall(null);
        });

        call.on('reject', () => {
          console.log('[InboundCalls] Call rejected');
          setIncomingCall(null);
        });
      });

      console.log('[InboundCalls] Registering device...');
      await device.register();
      deviceRef.current = device;
      console.log('[InboundCalls] Device registration initiated');

    } catch (error) {
      console.error('[InboundCalls] ❌ Error initializing inbound call device:', error);
    }
  }, [organization?.id, userProfile?.id, checkUserShouldReceiveCalls]);

  // Answer incoming call
  const answerCall = useCallback(() => {
    if (incomingCall?.call) {
      console.log('[InboundCalls] Answering call...');
      
      // Preserve contact info BEFORE clearing incomingCall
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
      console.log('[InboundCalls] Rejecting call...');
      incomingCall.call.reject();
      setIncomingCall(null);
    }
  }, [incomingCall]);

  // End active call
  const endCall = useCallback(() => {
    if (activeCall) {
      console.log('[InboundCalls] Ending call...');
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
      console.log('[InboundCalls] Mute toggled:', newMuteState);
    }
  }, [activeCall, isMuted]);

  // Initialize on mount
  useEffect(() => {
    console.log('[InboundCalls] Hook mounted, will initialize device when org/user available');
    initializeDevice();

    return () => {
      console.log('[InboundCalls] Hook unmounting, destroying device');
      if (deviceRef.current) {
        deviceRef.current.destroy();
        deviceRef.current = null;
      }
    };
  }, [initializeDevice]);

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
