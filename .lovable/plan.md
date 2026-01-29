
# Plano: Corrigir Problemas do Chat e Lista de Contatos

## Resumo

Corrigir dois bugs críticos:

1. **ContactMessages**: O chat deve permitir **ler** todas as mensagens mesmo fora da janela 24h
2. **NewConversationDialog**: Mostrar nome corretamente ou fallback para telefone

---

## Problema 1: ContactMessages não permite ler mensagens

### Diagnóstico

Ao analisar o código, identifiquei que:

1. A área de mensagens (ScrollArea) está sendo renderizada corretamente nas linhas 490-556
2. O problema pode estar na condição `showTemplates` que **substitui todo o componente** (linhas 465-473)
3. Ou a altura `max-h-[400px]` pode não estar funcionando corretamente no contexto

**Problema real identificado**: Quando o usuário está fora da janela 24h e clica em "Enviar Template", o `showTemplates` fica `true` e substitui TODO o componente pelo `WhatsAppTemplateSelector`. Mesmo após enviar, se o usuário não receber resposta, não consegue ver as mensagens pois ficou preso no seletor de templates.

### Solução

Modificar a lógica para:

1. **Sempre mostrar as mensagens** - o ScrollArea deve estar visível independente do estado
2. **Templates como overlay/modal** - não substituir todo o componente
3. **Permitir cancelar** - voltar para ver as mensagens sem enviar template

**Mudanças:**

```tsx
// ANTES (substitui tudo):
if (showTemplates) {
  return (
    <WhatsAppTemplateSelector ... />
  );
}

// DEPOIS (modal sobre o chat):
return (
  <div className="flex flex-col h-full">
    {/* Alert 24h - sempre visível */}
    
    {/* Messages - SEMPRE visíveis */}
    <ScrollArea className="flex-1 min-h-[200px]">
      {/* mensagens */}
    </ScrollArea>
    
    {/* Input ou botão template */}
    
    {/* Template Selector como Dialog */}
    <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
      <DialogContent>
        <WhatsAppTemplateSelector ... />
      </DialogContent>
    </Dialog>
  </div>
);
```

---

## Problema 2: Nomes não aparecem na lista de contatos

### Diagnóstico

Consultei o banco de dados e descobri que os primeiros contatos (quando ordenados por `full_name`) têm nomes compostos apenas por caracteres especiais/emojis invisíveis:

| full_name | phone |
|-----------|-------|
| `­­` (caracteres invisíveis) | +5511983907268 |
| `‍️` (zwj + emoji invisível) | +5511913591723 |
| `.` | +5515996108283 |

Quando ordenados alfabeticamente, caracteres especiais vêm antes das letras. Por isso aparecem 50 contatos "sem nome" visualmente.

### Solução

1. **Filtrar contatos com nomes válidos** - nome deve ter pelo menos 1 caractere alfanumérico
2. **Mostrar fallback para telefone** - se nome for inválido, mostrar o telefone como nome
3. **Ordenar por nome válido** - contatos sem nome real aparecem no final

**Mudanças na query:**

```tsx
// Função para validar se nome é "real"
const isValidName = (name: string | null): boolean => {
  if (!name) return false;
  // Remove caracteres especiais e verifica se sobra algo
  const cleaned = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  return cleaned.length > 0;
};

// Na renderização, mostrar fallback:
<p className="font-medium text-sm truncate">
  {isValidName(contact.full_name) 
    ? contact.full_name 
    : contact.phone}
</p>
```

**OU ordenar melhor no banco:**

```tsx
// Primeiro: contatos com nome alfanumérico válido
// Depois: ordenar por nome
// Por último: contatos sem nome válido (mostrar telefone)

// Adicionar campo computed ou usar CASE WHEN
```

---

## Arquivos a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/contacts/ContactMessages.tsx` | Templates como Dialog, não substituir todo o componente |
| `src/components/messages/NewConversationDialog.tsx` | Validar nome e mostrar fallback |

---

## Mudanças Detalhadas

### 1. ContactMessages.tsx

**Estrutura corrigida:**

```tsx
import { Dialog, DialogContent } from '@/components/ui/dialog';

// ...

return (
  <div className="flex flex-col h-full">
    {/* 24h Warning - sempre visível */}
    {!isIn24hWindow && messages.length > 0 && (
      <Alert>...</Alert>
    )}

    {/* Messages - SEMPRE visíveis */}
    <ScrollArea className="flex-1 min-h-[200px]">
      {/* lista de mensagens */}
    </ScrollArea>

    {/* Input Area */}
    <div className="pt-4 border-t mt-4">
      {isIn24hWindow || messages.length === 0 ? (
        // Input completo com upload, audio, emoji, IA
      ) : (
        // Botão para abrir templates
        <Button onClick={() => setShowTemplates(true)}>
          Enviar Template
        </Button>
      )}
    </div>

    {/* Template Selector as Dialog */}
    <Dialog open={showTemplates} onOpenChange={setShowTemplates}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <WhatsAppTemplateSelector
          onSelect={handleSendTemplate}
          onCancel={() => setShowTemplates(false)}
          loading={submitting}
        />
      </DialogContent>
    </Dialog>
  </div>
);
```

### 2. NewConversationDialog.tsx

**Adicionar validação de nome:**

```tsx
// Função helper para validar nome
const getDisplayName = (contact: Contact): string => {
  const name = contact.full_name?.trim();
  if (!name) return contact.phone;
  
  // Remove caracteres não-alfanuméricos e verifica se sobra algo
  const cleanName = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
  if (cleanName.length === 0) return contact.phone;
  
  return name;
};

// Na renderização:
{contacts?.map((contact) => {
  const displayName = getDisplayName(contact);
  const showPhoneAsSecondary = displayName !== contact.phone;
  
  return (
    <button key={contact.id} ...>
      <Avatar fallbackText={displayName} size="md" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{displayName}</p>
        {showPhoneAsSecondary && (
          <p className="text-xs text-muted-foreground truncate">
            {contact.phone}
          </p>
        )}
      </div>
    </button>
  );
})}
```

---

## Comportamento Final

### ContactMessages:

1. **Sempre mostra mensagens** - usuário pode rolar e ler toda a conversa
2. **Fora da janela 24h**: mostra botão "Enviar Template"
3. **Ao clicar**: abre Dialog com seletor de templates
4. **Pode cancelar**: fecha Dialog e continua lendo as mensagens

### NewConversationDialog:

1. **Contatos com nome válido**: mostra nome + telefone abaixo
2. **Contatos sem nome válido**: mostra telefone como nome principal
3. **Avatar**: usa o nome de exibição (válido ou telefone)

---

## Checklist de Validação

- [ ] Mensagens sempre visíveis, mesmo fora da janela 24h
- [ ] Scroll funciona para ler histórico
- [ ] Template Selector abre como Dialog
- [ ] Pode cancelar seleção de template
- [ ] Contatos mostram nome ou fallback para telefone
- [ ] Avatar funciona com fallback
- [ ] Busca continua funcionando

---

## Seção Técnica

### Regex para validar nome

```typescript
// Remove caracteres especiais Unicode (emojis, zero-width joiners, etc)
const cleanName = name.replace(/[^\p{L}\p{N}\s]/gu, '').trim();
```

- `\p{L}` - qualquer letra (Unicode)
- `\p{N}` - qualquer número (Unicode)
- `\s` - espaços
- `u` flag - modo Unicode

Isso remove:
- Emojis
- Zero-width joiners (`‍`)
- Soft hyphens (`­`)
- Outros caracteres especiais

### Por que Dialog ao invés de substituir?

Usando Dialog:
1. O componente pai continua renderizado
2. Usuário vê as mensagens por baixo
3. Pode fechar sem enviar
4. Melhor UX de não "perder" o contexto
