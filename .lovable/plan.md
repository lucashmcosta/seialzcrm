## Objetivo
Traduzir a mensagem de estado vazio e permitir arrastar arquivos direto na aba Anexos para fazer upload.

## Arquivo
`src/components/contacts/ContactAttachments.tsx` (único ponto de mudança)

## Mudanças

### 1. Tradução do empty state
- Trocar `"No attachments yet"` por `"Nenhum anexo ainda"`.
- Quando o drag estiver ativo, trocar visualmente para `"Solte o arquivo para enviar"`.

### 2. Drag-and-drop
- Adicionar estado local `isDragging` e um contador `dragCounter` (via `useRef`) para lidar corretamente com `dragenter`/`dragleave` em elementos filhos.
- Handlers `onDragEnter`, `onDragOver`, `onDragLeave`, `onDrop` aplicados no `<Card>` inteiro (área generosa, mesmo com lista vazia).
- No `onDrop`: pegar `e.dataTransfer.files[0]` e reusar a função `handleFileUpload` existente (refatorada para aceitar `File` direto, e o handler do `<input>` passa a chamá-la).
- Bloquear drop enquanto `uploading` estiver true.
- Feedback visual: quando `isDragging`, aplicar borda tracejada `border-2 border-dashed border-primary` e leve `bg-primary/5` no Card, sem remontar/piscar a lista.

### 3. Detalhes técnicos
- Não alterar lógica de storage, RLS ou schema.
- Manter suporte a upload por botão "Enviar" existente.
- Um arquivo por vez (mesmo comportamento atual). Múltiplos arquivos ficam fora do escopo desta mudança.
- Sem alterar outras abas ou componentes.

## Fora do escopo
- Upload múltiplo simultâneo
- Preview durante drag
- Validação de tipo/tamanho (mantém comportamento atual)
