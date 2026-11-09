import { Fragment, useMemo, type ReactNode } from 'react';
import { parseWhatsAppText, type WaNode } from '@/lib/whatsappFormat';

interface WhatsAppFormattedTextProps {
  content: string;
  className?: string;
}

function render(nodes: WaNode[]): ReactNode {
  return nodes.map((node, i) => {
    switch (node.type) {
      case 'text': return <Fragment key={i}>{node.text}</Fragment>;
      case 'link': return <a key={i} href={node.href} target="_blank" rel="noopener noreferrer" className="underline hover:opacity-80">{node.text}</a>;
      case 'code': return <code key={i} className="rounded bg-black/10 px-1 font-mono text-xs dark:bg-white/10">{node.text}</code>;
      case 'bold': return <strong key={i}>{render(node.children)}</strong>;
      case 'italic': return <em key={i}>{render(node.children)}</em>;
      case 'strike': return <del key={i}>{render(node.children)}</del>;
    }
  });
}

// Mostra a mensagem como o WhatsApp mostra. Sem HTML: o texto do cliente nunca vira marcação.
export function WhatsAppFormattedText({ content, className = '' }: WhatsAppFormattedTextProps) {
  const nodes = useMemo(() => parseWhatsAppText(content), [content]);
  return <div className={`whitespace-pre-wrap break-words text-sm leading-relaxed ${className}`}>{render(nodes)}</div>;
}
