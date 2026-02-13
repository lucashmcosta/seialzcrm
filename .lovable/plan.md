
# Substituir botao de anexo por botao "+" com menu expandido

## O que muda

O botao com icone de clipe (Paperclip) no `MediaUploadButton` sera substituido por um botao "+" que abre um menu com 4 opcoes:

1. **Imagem** - selecionar imagem da galeria
2. **Video** - selecionar video
3. **Documento** - selecionar PDF, DOC, etc.
4. **Template** - abrir o seletor de templates WhatsApp

## Alteracoes

### Arquivo 1: `src/components/whatsapp/MediaUploadButton.tsx`

- Trocar o icone `Paperclip` por `Plus` (lucide-react)
- Adicionar input de video (`accept="video/*"`)
- Adicionar nova prop `onTemplateClick` para disparar a abertura do seletor de templates
- Adicionar item "Template" no dropdown com icone de documento/template
- Adicionar item "Video" no dropdown

Nova interface:
```typescript
interface MediaUploadButtonProps {
  onFileSelected: (file: File) => void;
  onTemplateClick?: () => void;
  disabled?: boolean;
}
```

Menu resultante:
```text
+-------------------------------+
|  [Imagem icon]   Imagem       |
|  [Video icon]    Video        |
|  [Doc icon]      Documento    |
|  [Template icon] Template     |
+-------------------------------+
```

### Arquivo 2: `src/pages/messages/MessagesList.tsx`

- Passar `onTemplateClick={() => setShowTemplates(true)}` para o `MediaUploadButton`
- Remover o botao separado de template que existe hoje (se houver nesse contexto)

### Arquivo 3: `src/components/whatsapp/WhatsAppChat.tsx`

- Passar `onTemplateClick={() => setShowTemplates(true)}` para o `MediaUploadButton`
- Remover o botao separado de template (o botao com icone SVG de retangulo nas linhas 507-519)
- Simplificar o layout dos botoes ao lado do textarea

### Arquivo 4: `src/components/contacts/ContactMessages.tsx`

- Passar `onTemplateClick` para o `MediaUploadButton` (se houver seletor de templates nesse contexto)

## Detalhes tecnicos

- O `MediaUploadButton` tera 3 inputs hidden: imagem (`image/*`), video (`video/*`), documento (`.pdf,.doc,...`)
- O item "Template" nao abre file picker, apenas chama `onTemplateClick()`
- O item "Template" so aparece se `onTemplateClick` foi passado como prop
- O botao "+" usa `variant="ghost"` e `size="icon"` para manter consistencia com os outros botoes da barra
