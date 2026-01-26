
# Plano: Formatação WhatsApp 100% Idêntica (com Links Clicáveis)

## Problema

O chat no CRM mostra texto diferente do que o cliente vê no WhatsApp:
- Listas com `-` em vez de `•`
- Sem espaçamento entre parágrafos
- Links não são clicáveis
- Formatação (*negrito*, _itálico_) não renderizada

---

## Solução

Criar componente `WhatsAppFormattedText` que replica exatamente a renderização do WhatsApp, incluindo links clicáveis.

---

## Arquivos a Modificar

| Arquivo | Ação | Descrição |
|---------|------|-----------|
| `src/components/whatsapp/WhatsAppFormattedText.tsx` | CRIAR | Componente de formatação |
| `src/components/whatsapp/WhatsAppChat.tsx` | EDITAR | Importar e usar o novo componente |

---

## Implementação

### 1. CRIAR: WhatsAppFormattedText.tsx

```tsx
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
```

### 2. EDITAR: WhatsAppChat.tsx

**Adicionar import (linha 16):**
```tsx
import { WhatsAppFormattedText } from './WhatsAppFormattedText';
```

**Substituir linha 443-445:**

De:
```tsx
{message.content && (
  <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
)}
```

Para:
```tsx
{message.content && (
  <WhatsAppFormattedText content={message.content} />
)}
```

---

## Formatações Suportadas

| Sintaxe | Resultado | Exemplo |
|---------|-----------|---------|
| `- texto` | • texto | Bullet point |
| `https://...` | Link clicável azul | Links |
| `*texto*` | **texto** | Negrito |
| `_texto_` | *texto* | Itálico |
| `~texto~` | ~~texto~~ | Riscado |
| ``` `texto` ``` | `texto` | Código/mono |
| `\n` | Quebra de linha | |
| `\n\n` | Novo parágrafo com espaço | |

---

## Resultado Visual

```text
ANTES (CRM):
- 6 dias úteis (se for urgente)
- 10 a 15 dias úteis
https://example.com

DEPOIS (CRM = WhatsApp):
• 6 dias úteis (se for urgente)
• 10 a 15 dias úteis
https://example.com  ← clicável em azul
```

---

## Seção Técnica

### Segurança
- HTML escapado antes do processamento (previne XSS)
- Links com `rel="noopener noreferrer"` para segurança
- `target="_blank"` para abrir em nova aba

### Ordem das Regex (importante)
1. Escape HTML primeiro
2. Bullets (não interfere com outras)
3. Links (antes de outras formatações para não quebrar URLs)
4. Negrito/Itálico/Riscado
5. Quebras de linha por último
