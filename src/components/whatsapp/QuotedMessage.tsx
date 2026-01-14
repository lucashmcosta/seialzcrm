import React from 'react';

interface QuotedMessageProps {
  content: string;
  direction: string;
  onClick?: () => void;
}

export const QuotedMessage: React.FC<QuotedMessageProps> = ({ 
  content, 
  direction,
  onClick 
}) => {
  const isFromMe = direction === 'outbound';
  
  // Truncate content if too long
  const displayContent = content.length > 100 
    ? content.substring(0, 100) + '...' 
    : content;
  
  // Check if it's a media message
  const isMedia = content.startsWith('📷') || content.startsWith('🎵') || 
                  content.startsWith('🎬') || content.startsWith('📎');

  return (
    <div 
      className="mb-2 cursor-pointer rounded-md border-l-4 border-primary bg-muted/50 p-2"
      onClick={onClick}
    >
      <p className="text-xs font-medium text-primary">
        {isFromMe ? 'Você' : 'Contato'}
      </p>
      <p className="text-xs text-muted-foreground line-clamp-2">
        {isMedia ? content : displayContent}
      </p>
    </div>
  );
};
