import React from 'react';

interface WhatsAppFormattedTextProps {
  content: string;
  className?: string;
}

export function WhatsAppFormattedText({ content, className = '' }: WhatsAppFormattedTextProps) {
  const formatWhatsAppText = (text: string): string => {
    // 1. Escapar HTML para prevenir XSS
    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
    
    // 2. Converter listas: "- texto" no início de linha → "• texto"
    formatted = formatted.replace(/^- /gm, '• ');
    
    // 3. Links: https://... → <a href="...">...</a>
    formatted = formatted.replace(
      /(https?:\/\/[^\s<]+)/g, 
      '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-blue-500 underline hover:text-blue-600">$1</a>'
    );
    
    // 4. Negrito: *texto* → <strong>texto</strong>
    formatted = formatted.replace(/\*([^*]+)\*/g, '<strong>$1</strong>');
    
    // 5. Itálico: _texto_ → <em>texto</em>
    formatted = formatted.replace(/_([^_]+)_/g, '<em>$1</em>');
    
    // 6. Riscado: ~texto~ → <del>texto</del>
    formatted = formatted.replace(/~([^~]+)~/g, '<del>$1</del>');
    
    // 7. Monospace: ```texto``` → <code>texto</code>
    formatted = formatted.replace(/```([^`]+)```/g, '<code class="bg-black/10 dark:bg-white/10 px-1 rounded font-mono text-xs">$1</code>');
    
    // 8. Quebras de linha duplas (parágrafos) → espaço visual
    formatted = formatted.replace(/\n\n/g, '</p><p class="mt-3">');
    
    // 9. Quebras de linha simples → <br>
    formatted = formatted.replace(/\n/g, '<br />');
    
    // Wrap em parágrafo
    formatted = `<p>${formatted}</p>`;
    
    return formatted;
  };

  return (
    <div 
      className={`text-sm break-words [&_p]:leading-relaxed ${className}`}
      dangerouslySetInnerHTML={{ __html: formatWhatsAppText(content) }}
    />
  );
}
