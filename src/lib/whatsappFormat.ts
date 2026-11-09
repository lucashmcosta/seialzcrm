// Formatação do WhatsApp (*negrito*, _itálico_, ~riscado~, ```mono```, `mono`, listas e links).
// Devolve uma árvore, e não HTML, porque o texto vem do cliente: nada dele vira marcação.
// Testes em tests/whatsapp-format.test.ts.
export type WaNode =
  | { type: 'text'; text: string }
  | { type: 'link'; href: string; text: string }
  | { type: 'code'; text: string }
  | { type: 'bold' | 'italic' | 'strike'; children: WaNode[] };

const MARKERS = { '*': 'bold', _: 'italic', '~': 'strike' } as const;
type Marker = keyof typeof MARKERS;
const WORD = /[\p{L}\p{N}]/u;
const URL = /^https?:\/\/[^\s<>"'`]+/i;

const isBoundary = (char: string | undefined) => !char || !WORD.test(char);
const isSpace = (char: string | undefined) => !char || /\s/.test(char);

// O WhatsApp só formata quando o marcador encosta no texto e não está no meio de uma palavra.
function findClosing(text: string, marker: string, from: number): number {
  for (let i = from; i < text.length; i++) {
    if (text[i] === '\n') return -1;
    if (text[i] === marker && i > from && !isSpace(text[i - 1]) && isBoundary(text[i + 1])) return i;
  }
  return -1;
}

function parseInline(text: string): WaNode[] {
  const nodes: WaNode[] = [];
  let buffer = '';
  const flush = () => {
    if (buffer) nodes.push({ type: 'text', text: buffer });
    buffer = '';
  };

  let i = 0;
  while (i < text.length) {
    const char = text[i];

    if ((char === 'h' || char === 'H') && isBoundary(text[i - 1])) {
      const match = text.slice(i).match(URL);
      if (match) {
        // Pontuação no fim da frase não faz parte do link.
        const url = match[0].replace(/[.,;:!?)\]]+$/, '');
        flush();
        nodes.push({ type: 'link', href: url, text: url });
        i += url.length;
        continue;
      }
    }

    if (text.startsWith('```', i)) {
      const end = text.indexOf('```', i + 3);
      if (end > i + 3) {
        flush();
        nodes.push({ type: 'code', text: text.slice(i + 3, end) });
        i = end + 3;
        continue;
      }
    }

    if (char === '`') {
      const end = text.indexOf('`', i + 1);
      if (end > i + 1 && !text.slice(i + 1, end).includes('\n')) {
        flush();
        nodes.push({ type: 'code', text: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    if (char in MARKERS && isBoundary(text[i - 1]) && !isSpace(text[i + 1])) {
      const end = findClosing(text, char, i + 1);
      if (end > 0) {
        flush();
        nodes.push({ type: MARKERS[char as Marker], children: parseInline(text.slice(i + 1, end)) });
        i = end + 1;
        continue;
      }
    }

    buffer += char;
    i++;
  }
  flush();
  return nodes;
}

export function parseWhatsAppText(text: string): WaNode[] {
  return parseInline((text ?? '').replace(/^[-*] (?=\S)/gm, '• '));
}

function plain(nodes: WaNode[]): string {
  return nodes.map((n) => ('children' in n ? plain(n.children) : n.text)).join('');
}

/** Texto sem os marcadores, para prévias como a lista de conversas. */
export function stripWhatsAppFormatting(text: string): string {
  return plain(parseWhatsAppText(text));
}
