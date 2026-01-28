import { cn } from '@/lib/utils';
import { Check, Phone, ExternalLink, Copy } from 'lucide-react';

interface WhatsAppPreviewProps {
  body: string;
  header?: string;
  footer?: string;
  variables?: { key: string; name: string; example: string }[];
  buttons?: { id: string; title: string }[];
  actions?: { type: string; title: string; value?: string }[];
  mediaUrl?: string;
  className?: string;
}

export function WhatsAppPreview({
  body,
  header,
  footer,
  variables = [],
  buttons = [],
  actions = [],
  mediaUrl,
  className,
}: WhatsAppPreviewProps) {
  // Replace variables with examples
  const getPreviewBody = () => {
    let preview = body;
    variables.forEach((v, index) => {
      const placeholder = `{{${index + 1}}}`;
      preview = preview.replace(
        new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'),
        v.example || `[${v.name || `Variável ${index + 1}`}]`
      );
    });
    return preview;
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'phone':
        return <Phone className="w-3 h-3" />;
      case 'url':
        return <ExternalLink className="w-3 h-3" />;
      case 'copy_code':
        return <Copy className="w-3 h-3" />;
      default:
        return null;
    }
  };

  return (
    <div className={cn('rounded-xl overflow-hidden', className)}>
      {/* Phone frame */}
      <div className="bg-slate-800 dark:bg-slate-900 p-2 rounded-t-xl">
        <div className="flex items-center justify-center gap-2">
          <div className="w-16 h-1 bg-slate-600 rounded-full" />
        </div>
      </div>
      
      {/* Chat area */}
      <div 
        className="p-4 min-h-[300px]"
        style={{
          backgroundImage: 'url("data:image/svg+xml,%3Csvg width=\'60\' height=\'60\' viewBox=\'0 0 60 60\' xmlns=\'http://www.w3.org/2000/svg\'%3E%3Cg fill=\'none\' fill-rule=\'evenodd\'%3E%3Cg fill=\'%239C92AC\' fill-opacity=\'0.08\'%3E%3Cpath d=\'M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z\'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")',
          backgroundColor: '#e5ddd5',
        }}
      >
        {/* Message bubble */}
        <div className="max-w-[85%] ml-auto">
          {/* Media preview */}
          {mediaUrl && (
            <div className="bg-slate-200 dark:bg-slate-700 rounded-t-lg rounded-bl-lg overflow-hidden mb-1">
              <img 
                src={mediaUrl} 
                alt="Preview" 
                className="w-full h-32 object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).style.display = 'none';
                }}
              />
            </div>
          )}
          
          {/* Message content */}
          <div className="bg-[#dcf8c6] dark:bg-green-900 rounded-lg rounded-tr-none p-3 shadow-sm">
            {/* Header */}
            {header && (
              <p className="text-sm font-semibold text-foreground mb-1">{header}</p>
            )}
            
            {/* Body */}
            <p className="text-sm text-foreground whitespace-pre-wrap break-words">
              {getPreviewBody() || 'Digite o corpo da mensagem...'}
            </p>
            
            {/* Footer */}
            {footer && (
              <p className="text-xs text-muted-foreground mt-2">{footer}</p>
            )}
            
            {/* Timestamp and checks */}
            <div className="flex items-center justify-end gap-1 mt-1">
              <span className="text-[10px] text-slate-500 dark:text-slate-400">
                {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
              </span>
              <div className="flex -space-x-1">
                <Check className="w-3 h-3 text-blue-500" />
                <Check className="w-3 h-3 text-blue-500" />
              </div>
            </div>
          </div>
          
          {/* Quick reply buttons */}
          {buttons.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {buttons.map((button, index) => (
                <button
                  key={button.id || index}
                  className="flex-1 min-w-[45%] px-4 py-2 text-sm font-medium text-blue-600 bg-white dark:bg-slate-800 dark:text-blue-400 rounded-full border border-slate-200 dark:border-slate-700 shadow-sm"
                >
                  {button.title}
                </button>
              ))}
            </div>
          )}
          
          {/* CTA buttons */}
          {actions.length > 0 && (
            <div className="mt-2 space-y-1">
              {actions.map((action, index) => (
                <button
                  key={index}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 bg-white dark:bg-slate-800 dark:text-blue-400 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm"
                >
                  {getActionIcon(action.type)}
                  {action.title}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Bottom bar */}
      <div className="bg-slate-100 dark:bg-slate-800 p-3 rounded-b-xl">
        <div className="bg-white dark:bg-slate-700 rounded-full px-4 py-2 text-sm text-muted-foreground">
          Digite uma mensagem...
        </div>
      </div>
    </div>
  );
}
