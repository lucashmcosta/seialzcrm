import { useOutboundCall } from '@/contexts/OutboundCallContext';
import { OutboundCallModal } from './OutboundCallModal';
import { MinimizedCallWidget } from './MinimizedCallWidget';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { PhoneOutgoing } from '@phosphor-icons/react';
import { formatPhoneDisplay } from '@/lib/phoneUtils';

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
    numberSelection,
    selectOutboundNumber,
    cancelOutboundNumberSelection,
  } = useOutboundCall();

  const numberSelector = numberSelection ? (
    <Dialog open onOpenChange={(open) => {
      if (!open) cancelOutboundNumberSelection();
    }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Escolha o número de saída</DialogTitle>
          <DialogDescription>O destinatário verá este número como identificador da chamada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {numberSelection.options.map((option) => (
            <Button
              key={option.id}
              variant="outline"
              className="h-auto w-full justify-start p-3 text-left"
              onClick={() => selectOutboundNumber(option.id)}
            >
              <PhoneOutgoing className="mr-3 h-5 w-5 text-primary" />
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{option.friendlyName}</span>
                <span className="block text-xs text-muted-foreground">{formatPhoneDisplay(option.phoneNumber)}</span>
              </span>
              <Badge variant="outline">{option.numberType === 'user' ? 'Individual' : 'Corporativo'}</Badge>
              {option.automatic && <Badge className="ml-1">Automático</Badge>}
            </Button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  ) : null;

  // Don't render anything if not on a call
  if (!isOnCall || !callInfo) {
    return numberSelector;
  }

  // Render minimized widget
  if (isMinimized) {
    return (
      <>
        {numberSelector}
        <MinimizedCallWidget
          contactName={callInfo.contactName}
          from={callInfo.phoneNumber}
          duration={duration}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          onEndCall={endCall}
          onExpand={() => setMinimized(false)}
        />
      </>
    );
  }

  // Render full modal
  return (
    <>
      {numberSelector}
      <OutboundCallModal
        open={true}
        phoneNumber={callInfo.phoneNumber}
        contactName={callInfo.contactName}
        fromNumber={callInfo.fromNumber}
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
    </>
  );
}
