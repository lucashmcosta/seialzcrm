import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { OutboundCallModal } from './OutboundCallModal';
import { MinimizedCallWidget } from './MinimizedCallWidget';

/**
 * Global handler for outbound calls.
 * Should be rendered once at the app root level (e.g., in App.tsx).
 * Renders either the full modal or minimized widget based on state.
 */
export function OutboundCallHandler() {
  const {
    isOnCall,
    callInfo,
    status,
    duration,
    isMuted,
    dtmfDigits,
    errorMessage,
    endCall,
    toggleMute,
    sendDTMF,
    isMinimized,
    setMinimized,
  } = useOutboundCall();

  // Don't render anything if not on a call
  if (!isOnCall || !callInfo) {
    return null;
  }

  // Render minimized widget
  if (isMinimized) {
    return (
      <MinimizedCallWidget
        contactName={callInfo.contactName}
        from={callInfo.phoneNumber}
        duration={duration}
        isMuted={isMuted}
        onToggleMute={toggleMute}
        onEndCall={endCall}
        onExpand={() => setMinimized(false)}
      />
    );
  }

  // Render full modal
  return (
    <OutboundCallModal
      open={true}
      phoneNumber={callInfo.phoneNumber}
      contactName={callInfo.contactName}
      status={status}
      duration={duration}
      isMuted={isMuted}
      dtmfDigits={dtmfDigits}
      errorMessage={errorMessage}
      onEndCall={endCall}
      onToggleMute={toggleMute}
      onDialPress={sendDTMF}
      onMinimize={() => setMinimized(true)}
    />
  );
}
