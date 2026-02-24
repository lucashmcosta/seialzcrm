

# Notas Internas nas Conversas (usando tabela `activities`)

## Resumo

Adicionar opcao "Nota" no menu "+" do chat. As notas serao salvas na tabela `activities` (com `activity_type = 'note'`) vinculadas ao contato da conversa, NAO na tabela `messages`. Isso evita confusao entre mensagens reais e notas internas.

As notas aparecerao inline no chat com visual diferenciado (fundo amarelo), intercaladas com as mensagens por ordem cronologica.

## Como funciona para o usuario

1. Clica no "+" e seleciona "Nota"
2. A area de digitacao muda para fundo amarelo com indicador "Nota interna - nao sera enviada ao cliente"
3. Digita a nota e envia
4. A nota aparece no chat com fundo amarelo e badge "Nota interna"
5. A nota fica salva na tabela `activities`, visivel tambem na aba Notas do contato

## Detalhes Tecnicos

### 1. MediaUploadButton (`src/components/whatsapp/MediaUploadButton.tsx`)

- Adicionar prop `onNoteClick`
- Novo item no dropdown com icone `StickyNote` e texto "Nota"

### 2. MessagesList (`src/pages/messages/MessagesList.tsx`)

**Novos estados:**
- `isNoteMode: boolean` - controla se o input esta no modo nota
- `inlineNotes: array` - notas carregadas da tabela `activities` para o contato atual

**Busca de notas:**
- Ao selecionar uma thread, alem de buscar mensagens, buscar notas da tabela `activities` onde `contact_id` = contato da thread e `activity_type = 'note'`
- Cada nota tera campos: `id`, `body`, `occurred_at`, `created_by_user_id`

**Mesclagem para exibicao:**
- Criar um array unificado combinando `messages` e `inlineNotes`, ordenado por data (`sent_at` para mensagens, `occurred_at` para notas)
- Cada item tera um campo `_type: 'message' | 'note'` para diferenciar na renderizacao

**Renderizacao das notas:**
- Notas aparecem com fundo amarelo (`bg-yellow-100 dark:bg-yellow-900/30`), centralizadas (nao alinhadas a esquerda ou direita)
- Badge "Nota interna" com icone de nota no topo
- Exibe o nome do autor e horario

**Salvar nota:**
- Quando usuario envia no modo nota, inserir na tabela `activities`:
  ```
  organization_id, contact_id, activity_type: 'note',
  title: 'Nota na conversa', body: texto,
  created_by_user_id: userProfile.id, occurred_at: now()
  ```
- Adicionar a nota otimisticamente ao array `inlineNotes`
- Desativar `isNoteMode` apos envio

**Visual do input em modo nota:**
- Barra amarela acima do textarea: "Nota interna - nao sera enviada ao cliente" com botao X para cancelar
- Textarea com borda/fundo amarelo sutil

**Passar `onNoteClick` para MediaUploadButton:**
```tsx
<MediaUploadButton
  onFileSelected={handleFileSelected}
  onTemplateClick={() => setShowTemplates(true)}
  onNoteClick={() => setIsNoteMode(true)}
  disabled={submitting || mediaUploading}
/>
```

### Resumo das mudancas

| Arquivo | Mudanca |
|---------|---------|
| `src/components/whatsapp/MediaUploadButton.tsx` | Prop `onNoteClick` + item "Nota" no menu |
| `src/pages/messages/MessagesList.tsx` | Estado `isNoteMode`, busca de notas em `activities`, mesclagem cronologica com mensagens, visual amarelo para notas, handler de salvamento em `activities` |

### Vantagens desta abordagem

- Notas ficam na tabela `activities`, sem poluir a tabela `messages`
- As mesmas notas aparecem na aba "Notas" do contato (componente `ContactNotes` ja existente)
- Separacao clara entre comunicacao com cliente e anotacoes internas

