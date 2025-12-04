import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { PhoneOff, Mic, MicOff, Maximize2, User, GripVertical } from 'lucide-react';
import { formatPhoneDisplay } from '@/lib/phoneUtils';

interface MinimizedCallWidgetProps {
  contactName?: string;
  from: string;
  duration: number;
  isMuted: boolean;
  onToggleMute: () => void;
  onEndCall: () => void;
  onExpand: () => void;
}

export function MinimizedCallWidget({
  contactName,
  from,
  duration,
  isMuted,
  onToggleMute,
  onEndCall,
  onExpand
}: MinimizedCallWidgetProps) {
  const [position, setPosition] = useState({ 
    x: typeof window !== 'undefined' ? window.innerWidth - 340 : 0, 
    y: typeof window !== 'undefined' ? window.innerHeight - 100 : 0 
  });
  const [isDragging, setIsDragging] = useState(false);
  const dragOffset = useRef({ x: 0, y: 0 });
  const widgetRef = useRef<HTMLDivElement>(null);

  // Initialize position on mount
  useEffect(() => {
    setPosition({
      x: window.innerWidth - 340,
      y: window.innerHeight - 100
    });
  }, []);

  const formatDuration = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (widgetRef.current) {
      setIsDragging(true);
      dragOffset.current = {
        x: e.clientX - position.x,
        y: e.clientY - position.y
      };
    }
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      const newX = Math.max(0, Math.min(window.innerWidth - 320, e.clientX - dragOffset.current.x));
      const newY = Math.max(0, Math.min(window.innerHeight - 80, e.clientY - dragOffset.current.y));
      setPosition({ x: newX, y: newY });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging]);

  return (
    <div
      ref={widgetRef}
      style={{
        position: 'fixed',
        left: position.x,
        top: position.y,
        zIndex: 9999
      }}
      className="bg-card border border-border rounded-lg shadow-lg select-none"
    >
      <div className="flex items-center gap-3 p-3">
        {/* Drag Handle */}
        <div 
          className="cursor-move text-muted-foreground hover:text-foreground"
          onMouseDown={handleMouseDown}
        >
          <GripVertical className="h-4 w-4" />
        </div>

        {/* Avatar */}
        <Avatar className="h-10 w-10">
          <AvatarFallback className="bg-primary/10 text-primary text-sm">
            {contactName ? contactName.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
          </AvatarFallback>
        </Avatar>

        {/* Contact Info */}
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">
            {contactName || formatPhoneDisplay(from)}
          </p>
          <p className="text-xs text-muted-foreground font-mono">
            {formatDuration(duration)}
          </p>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          <Button
            variant={isMuted ? 'destructive' : 'secondary'}
            size="icon"
            className="h-8 w-8"
            onClick={onToggleMute}
          >
            {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
          </Button>
          <Button
            variant="destructive"
            size="icon"
            className="h-8 w-8"
            onClick={onEndCall}
          >
            <PhoneOff className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={onExpand}
          >
            <Maximize2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
