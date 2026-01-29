
# Plano: Corrigir Chat de Mensagens no Contato

## Problemas Identificados

1. **Botao feio e branco**: O botao "Enviar Template" esta usando `variant="outline"` (linha 640), que e apenas borda sem preenchimento, diferente do botao azul bonito que existia antes

2. **Scroll nao funciona**: O `ScrollArea` esta com `max-h-[400px]` FIXO (linha 488), o que limita a altura e impede de ver todas as mensagens

3. **Nao se ajusta a tela**: O componente nao ocupa a altura disponivel - o container pai (`Tabs.Panel`) nao esta passando altura, e o `ScrollArea` tem altura maxima fixa ao inves de usar `flex-grow`

## Solucao

### 1. Corrigir o Botao "Enviar Template"

Trocar de `variant="outline"` para estilo primario com cor azul:

```tsx
// ANTES (branco, feio):
<Button onClick={() => setShowTemplates(true)} className="w-full" variant="outline">

// DEPOIS (azul, bonito):
<Button onClick={() => setShowTemplates(true)} className="w-full">
```

Remover `variant="outline"` para usar o estilo primario padrao (azul/primary).

### 2. Corrigir Altura do ScrollArea

Remover a altura maxima fixa e usar flex para ocupar o espaco disponivel:

```tsx
// ANTES (altura fixa):
<ScrollArea className="flex-1 min-h-[250px] max-h-[400px]">

// DEPOIS (flex que cresce):
<ScrollArea className="flex-1 min-h-0">
```

- `flex-1` faz o componente crescer
- `min-h-0` e necessario para flex funcionar corretamente com scroll

### 3. Ajustar Container Principal

O container principal precisa ter altura definida:

```tsx
// ANTES:
<div className="flex flex-col h-full">

// DEPOIS:
<div className="flex flex-col h-[calc(100vh-300px)] min-h-[400px]">
```

Isso garante que o chat tenha uma altura baseada na viewport, subtraindo espaco do header/tabs.

### 4. Ajustar o Tabs.Panel no ContactDetail

O `Tabs.Panel` que contem o `ContactMessages` precisa ter altura definida para o filho herdar:

```tsx
// ANTES:
<Tabs.Panel id="messages">
  <ContactMessages contactId={contact.id} />
</Tabs.Panel>

// DEPOIS:
<Tabs.Panel id="messages" className="h-full">
  <ContactMessages contactId={contact.id} />
</Tabs.Panel>
```

---

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `src/components/contacts/ContactMessages.tsx` | Corrigir botao, remover max-h fixo, ajustar container |
| `src/pages/contacts/ContactDetail.tsx` | Adicionar altura ao Tabs.Panel de messages |

---

## Mudancas Detalhadas

### ContactMessages.tsx

**Linha 474 - Container principal:**
```tsx
// DE:
<div className="flex flex-col h-full">

// PARA:
<div className="flex flex-col h-[calc(100vh-320px)] min-h-[400px]">
```

**Linha 488 - ScrollArea:**
```tsx
// DE:
<ScrollArea className="flex-1 min-h-[250px] max-h-[400px]">

// PARA:
<ScrollArea className="flex-1 min-h-0">
```

**Linha 640 - Botao de Template:**
```tsx
// DE:
<Button onClick={() => setShowTemplates(true)} className="w-full" variant="outline">

// PARA:
<Button onClick={() => setShowTemplates(true)} className="w-full">
```

### ContactDetail.tsx

**Linha 307-309 - Tabs.Panel de messages:**
```tsx
// DE:
<Tabs.Panel id="messages">
  <ContactMessages contactId={contact.id} />
</Tabs.Panel>

// PARA:
<Tabs.Panel id="messages" className="flex-1 min-h-0">
  <ContactMessages contactId={contact.id} />
</Tabs.Panel>
```

---

## Comportamento Final

1. **Botao azul primario**: O botao "Enviar Template" volta a ser azul e visivel
2. **Scroll funciona**: Usuario pode rolar para cima/baixo para ver todas as mensagens
3. **Altura dinamica**: O chat ocupa o espaco disponivel na tela, nao mais limitado a 400px

---

## Checklist de Validacao

- [ ] Botao "Enviar Template" esta azul (primario)
- [ ] Scroll funciona para ver historico de mensagens
- [ ] Chat ocupa altura disponivel na tela
- [ ] Input de mensagem aparece quando dentro da janela 24h
- [ ] Todas as funcoes (upload, audio, emoji, IA) visiveis quando aplicavel
