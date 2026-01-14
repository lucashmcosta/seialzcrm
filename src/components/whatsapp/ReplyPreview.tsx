import React from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface Message {
  id: string;
  content: string;
  direction: string;
}

interface ReplyPreviewProps {
  message: Message;
  onClose: () => void;
}

export const ReplyPreview: React.FC<ReplyPreviewProps> = ({ message, onClose }) => {
  const isFromMe = message.direction === 'outbound';
  
  // Truncate content if too long
  const displayContent = message.content.length > 80 
    ? message.content.substring(0, 80) + '...' 
    : message.content;

  return (
    <div className="flex items-start gap-2 rounded-t-lg border border-b-0 border-border bg-muted/50 px-3 py-2">
      <div className="flex-1 border-l-4 border-primary pl-2">
        <p className="text-xs font-medium text-primary">
          Respondendo a {isFromMe ? 'você mesmo' : 'contato'}
        </p>
        <p className="text-sm text-muted-foreground line-clamp-1">
          {displayContent}
        </p>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-6 w-6 shrink-0"
        onClick={onClose}
      >
        <X className="h-4 w-4" />
      </Button>
    </div>
  );
};
