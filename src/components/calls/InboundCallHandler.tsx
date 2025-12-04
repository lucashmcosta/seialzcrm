import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useInboundCalls } from '@/hooks/useInboundCalls';
import { IncomingCallModal } from './IncomingCallModal';

/**
 * Global handler for inbound calls.
 * Should be rendered once at the app root level (e.g., in Layout).
 * Listens for incoming WebRTC calls and shows the IncomingCallModal.
 */
export function InboundCallHandler() {
  const navigate = useNavigate();
  const [isMinimized, setIsMinimized] = useState(false);

  const {
    incomingCall,
    activeCallInfo,
    answerCall,
    rejectCall,
    isOnCall,
    activeCall,
    endCall,
    toggleMute,
    isMuted
  } = useInboundCalls();

  // Custom answer handler: answer + minimize + navigate to contact
  const handleAnswer = useCallback(() => {
    // Get contact info before answering (it will be cleared)
    const contactId = incomingCall?.contactId;
    
    // Answer the call
    answerCall();
    
    // Minimize the modal
    setIsMinimized(true);
    
    // Navigate to contact detail if we have a contact
    if (contactId) {
      navigate(`/contacts/${contactId}`);
    }
  }, [answerCall, incomingCall?.contactId, navigate]);

  // Custom end call handler: reset minimized state
  const handleEndCall = useCallback(() => {
    endCall();
    setIsMinimized(false);
  }, [endCall]);

  // Use incoming call info when ringing, active call info when on call
  const displayFrom = incomingCall?.from || activeCallInfo?.from || '';
  const displayContactName = incomingCall?.contactName || activeCallInfo?.contactName;
  const displayContactId = incomingCall?.contactId || activeCallInfo?.contactId;

  return (
    <IncomingCallModal
      isRinging={!!incomingCall}
      isOnCall={isOnCall}
      from={displayFrom}
      contactName={displayContactName}
      contactId={displayContactId}
      onAnswer={handleAnswer}
      onReject={rejectCall}
      onEndCall={handleEndCall}
      onToggleMute={toggleMute}
      isMuted={isMuted}
      activeCall={activeCall}
      isMinimized={isMinimized}
      onMinimize={() => setIsMinimized(true)}
      onExpand={() => setIsMinimized(false)}
    />
  );
}
