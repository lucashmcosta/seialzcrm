
# Plano: Módulo de Mensagens Completo

## Resumo

Implementar duas melhorias fundamentais no sistema de mensagens:

1. **Botão "Nova Conversa"** na página de Mensagens para iniciar conversas via WhatsApp com qualquer contato
2. **Chat Completo na Aba de Mensagens do Contato** com todas as funcionalidades do módulo principal (arquivos, áudio, emoji, IA)

---

## Problema Atual

### 1. Página de Mensagens (`/messages`)
- Não existe botão para iniciar nova conversa
- O usuário só pode ver/responder conversas já existentes
- Falta o ícone "+" ou "Nova Conversa" no header

### 2. Aba de Mensagens no Contato (`ContactMessages.tsx`)
- Componente muito básico - apenas texto simples
- Usa canal "internal" (notas internas) ao invés de WhatsApp
- Não tem funcionalidades do chat real:
  - Enviar arquivos/imagens
  - Gravar e enviar áudio
  - Emoji picker
  - Melhoria de texto com IA
  - Status de entrega (✓ ✓✓)
  - Janela de 24h / Templates
  - Realtime updates

---

## Solução

### Parte 1: Botão "Nova Conversa" na Página de Mensagens

Adicionar um botão no header da lista de conversas que abre um dialog para selecionar um contato e iniciar a conversa.

**Componentes:**
1. Botão "+" no header da lista
2. Dialog para buscar e selecionar contato
3. Ao selecionar, criar thread WhatsApp e abrir no chat

### Parte 2: Reescrever `ContactMessages.tsx`

Substituir o componente básico atual por uma versão que:
- Use o canal **WhatsApp** (não internal)
- Busque a thread WhatsApp existente do contato
- Tenha todas as funcionalidades do chat principal:
  - Upload de arquivos e imagens
  - Gravação de áudio
  - Emoji picker
  - Correção de texto com IA
  - Status de entrega das mensagens
  - Janela de 24h e seleção de templates
  - Realtime updates

---

## Arquivos a Modificar/Criar

| Arquivo | Ação |
|---------|------|
| `src/pages/messages/MessagesList.tsx` | Adicionar botão + e dialog de nova conversa |
| `src/components/contacts/ContactMessages.tsx` | **Reescrever completamente** com WhatsApp chat |
| `src/components/messages/NewConversationDialog.tsx` | **Criar** - Dialog para selecionar contato |

---

## Mudanças Detalhadas

### 1. Criar `NewConversationDialog.tsx`

Dialog que permite buscar contatos e iniciar uma nova conversa WhatsApp.

```text
+------------------------------------------+
|  Nova Conversa                      [X]  |
+------------------------------------------+
|  🔍 Buscar contato...                    |
+------------------------------------------+
|  👤 João Silva                           |
|     +55 11 99999-9999                    |
|  ─────────────────────────────────────── |
|  👤 Maria Santos                         |
|     +55 21 88888-8888                    |
|  ─────────────────────────────────────── |
|  👤 Pedro Costa                          |
|     +55 31 77777-7777                    |
+------------------------------------------+
```

**Funcionalidades:**
- Busca em tempo real por nome ou telefone
- Mostra apenas contatos com telefone válido
- Ao clicar, cria/busca thread WhatsApp e seleciona no chat

### 2. Adicionar Botão no Header de Mensagens

No `MessagesList.tsx`, adicionar botão ao lado do contador:

```tsx
<div className="flex items-center justify-between mb-4">
  <h1 className="text-xl font-semibold text-foreground">
    {t('nav.messages')}
  </h1>
  <div className="flex items-center gap-2">
    <Button 
      variant="outline" 
      size="icon"
      onClick={() => setShowNewConversation(true)}
    >
      <MessageSquarePlus className="w-4 h-4" />
    </Button>
    <Badge color="gray" size="md">
      {threads?.length || 0}
    </Badge>
  </div>
</div>
```

### 3. Reescrever `ContactMessages.tsx`

O novo componente terá a mesma estrutura visual do chat principal, mas integrado dentro da aba do contato.

**Estrutura:**

```text
+------------------------------------------------+
| [Alerta de janela 24h - se aplicável]          |
+------------------------------------------------+
|                                                 |
|   Mensagens do contato aparecem aqui           |
|   com balões verdes (enviadas) e               |
|   cinzas (recebidas)                           |
|                                                 |
|   Suporte a:                                   |
|   - Imagens, áudio, vídeo, documentos          |
|   - Status ✓ ✓✓ (azul)                        |
|   - Badge "Agente IA" quando aplicável         |
|                                                 |
+------------------------------------------------+
| [📎] [🎤] | Digite uma mensagem...  | [✨] [▶] |
+------------------------------------------------+
```

**Props do componente:**
```typescript
interface ContactMessagesProps {
  contactId: string;
}
```

**Funcionalidades incluídas:**
- `MediaUploadButton` - Upload de arquivos
- `AudioRecorder` - Gravação de áudio
- `EmojiPicker` - Seleção de emojis
- AI Text Improvement (se IA habilitada)
- `WhatsAppTemplateSelector` - Para fora da janela 24h
- `WhatsAppFormattedText` - Renderização de markdown
- Realtime subscription para mensagens
- Status de entrega (sending → sent → delivered → read)

---

## Fluxo de Dados

### Nova Conversa

```text
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│ Clica no "+"    │────▶│ Dialog abre      │────▶│ Busca contatos │
│                 │     │ com busca        │     │ com telefone   │
└─────────────────┘     └──────────────────┘     └────────────────┘
                                                         │
         ┌───────────────────────────────────────────────┘
         ▼
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│ Seleciona       │────▶│ Busca thread     │────▶│ Abre chat com  │
│ contato         │     │ WhatsApp ou cria │     │ thread         │
└─────────────────┘     └──────────────────┘     └────────────────┘
```

### Aba de Mensagens do Contato

```text
┌─────────────────┐     ┌──────────────────┐     ┌────────────────┐
│ Abre aba        │────▶│ Busca thread     │────▶│ Carrega        │
│ "Mensagens"     │     │ WhatsApp         │     │ mensagens      │
└─────────────────┘     └──────────────────┘     └────────────────┘
                                                         │
         ┌───────────────────────────────────────────────┘
         ▼
┌─────────────────┐     ┌──────────────────┐
│ Inscreve em     │────▶│ UI atualiza em   │
│ Realtime        │     │ tempo real       │
└─────────────────┘     └──────────────────┘
```

---

## Checklist de Validação

**Nova Conversa:**
- [ ] Botão "+" aparece no header de mensagens
- [ ] Dialog abre ao clicar
- [ ] Busca de contatos funciona
- [ ] Contatos sem telefone não aparecem
- [ ] Ao selecionar, thread é criada/buscada
- [ ] Chat abre com o contato selecionado

**Aba de Mensagens do Contato:**
- [ ] Chat WhatsApp aparece na aba
- [ ] Mensagens carregam corretamente
- [ ] Upload de arquivos funciona
- [ ] Gravação de áudio funciona
- [ ] Emoji picker funciona
- [ ] Melhoria de texto com IA funciona (se disponível)
- [ ] Status de entrega aparece
- [ ] Janela de 24h é respeitada
- [ ] Templates aparecem quando fora da janela
- [ ] Realtime atualiza mensagens automaticamente

---

## Seção Técnica

### Estrutura do NewConversationDialog

```typescript
// src/components/messages/NewConversationDialog.tsx

interface NewConversationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelectContact: (contactId: string, threadId: string) => void;
}

// Busca contatos com telefone válido
const { data: contacts } = useQuery({
  queryKey: ['contacts-with-phone', organization?.id, search],
  queryFn: async () => {
    return supabase
      .from('contacts')
      .select('id, full_name, phone')
      .eq('organization_id', organization.id)
      .not('phone', 'is', null)
      .ilike('full_name', `%${search}%`)
      .is('deleted_at', null)
      .limit(20);
  }
});

// Ao selecionar contato
const handleSelect = async (contactId: string) => {
  // Busca thread existente ou cria nova
  const { data: thread } = await supabase
    .from('message_threads')
    .select('id')
    .eq('organization_id', organization.id)
    .eq('contact_id', contactId)
    .eq('channel', 'whatsapp')
    .maybeSingle();

  if (thread) {
    onSelectContact(contactId, thread.id);
  } else {
    // Cria nova thread
    const { data: newThread } = await supabase
      .from('message_threads')
      .insert({
        organization_id: organization.id,
        contact_id: contactId,
        channel: 'whatsapp'
      })
      .select()
      .single();
    
    onSelectContact(contactId, newThread.id);
  }
};
```

### Estrutura do ContactMessages Reescrito

```typescript
// src/components/contacts/ContactMessages.tsx

interface ContactMessagesProps {
  contactId: string;
}

// Componentes reutilizados:
import { MediaUploadButton } from '@/components/whatsapp/MediaUploadButton';
import { AudioRecorder } from '@/components/whatsapp/AudioRecorder';
import { WhatsAppTemplateSelector } from '@/components/whatsapp/WhatsAppTemplateSelector';
import { WhatsAppFormattedText } from '@/components/whatsapp/WhatsAppFormattedText';
import { AudioMessagePlayer } from '@/components/whatsapp/AudioMessagePlayer';
import EmojiPicker from 'emoji-picker-react';

// Estados principais:
const [threadId, setThreadId] = useState<string | null>(null);
const [messages, setMessages] = useState<Message[]>([]);
const [isIn24hWindow, setIsIn24hWindow] = useState(false);
const [showTemplates, setShowTemplates] = useState(false);

// Realtime subscription:
useEffect(() => {
  if (!threadId) return;
  
  const channel = supabase
    .channel(`contact-messages-${threadId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `thread_id=eq.${threadId}`,
    }, (payload) => {
      setMessages(prev => [...prev, payload.new]);
    })
    .subscribe();

  return () => supabase.removeChannel(channel);
}, [threadId]);
```

### Integração com o Hook de IA

```typescript
// Verificar se organização tem IA
const { data: hasAI } = useQuery({
  queryKey: ['org-has-ai', organization?.id],
  queryFn: async () => {
    const { data } = await supabase
      .from('organization_integrations')
      .select('is_enabled, integration:admin_integrations!inner(slug)')
      .eq('organization_id', organization.id)
      .eq('is_enabled', true)
      .in('integration.slug', ['claude-ai', 'openai-gpt']);
    
    return data && data.length > 0;
  }
});

// Se hasAI, mostrar botão de melhoria de texto
{hasAI && messageText.trim() && (
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button variant="ghost" size="icon">
        <Sparkles className="w-4 h-4" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent>
      <DropdownMenuItem onClick={() => handleImproveText('grammar')}>
        Corrigir gramática
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleImproveText('professional')}>
        Tornar profissional
      </DropdownMenuItem>
      <DropdownMenuItem onClick={() => handleImproveText('friendly')}>
        Tornar amigável
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
)}
```
