import { useInboundCalls } from '@/hooks/useInboundCalls';
import { IncomingCallModal } from './IncomingCallModal';

/**
 * Global handler for inbound calls.
 * Should be rendered once at the app root level (e.g., in Layout).
 * Listens for incoming WebRTC calls and shows the IncomingCallModal.
 */
export function InboundCallHandler() {
  const {
    incomingCall,
    answerCall,
    rejectCall,
    isOnCall,
    activeCall,
    endCall,
    toggleMute,
    isMuted
  } = useInboundCalls();

  return (
    <IncomingCallModal
      isRinging={!!incomingCall}
      isOnCall={isOnCall}
      from={incomingCall?.from || ''}
      contactName={incomingCall?.contactName}
      onAnswer={answerCall}
      onReject={rejectCall}
      onEndCall={endCall}
      onToggleMute={toggleMute}
      isMuted={isMuted}
      activeCall={activeCall}
    />
  );
}
