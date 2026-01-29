
# Plano: Ajustar Textarea para 6 Linhas e Ocultar Scrollbar

## Problemas Identificados

1. **Expande até 7 linhas**: O `maxHeight` de 150px permite ~7 linhas. Precisa ser ~130px para 6 linhas exatas
2. **Scrollbar visível**: A classe `scrollbar-none` não existe no CSS. A classe correta é `scrollbar-hide` (definida em `index.css`)

---

## Solução

### 1. Reduzir altura máxima para 6 linhas

Cada linha tem aproximadamente 20-22px. Para 6 linhas: 6 × 22 = 132px

Mudar de 150px para 130px em dois lugares:
- Na função `adjustTextareaHeight` 
- Na classe CSS do Textarea

### 2. Corrigir classe de scrollbar

Trocar `scrollbar-none` (não existe) por `scrollbar-hide` (existe em index.css)

---

## Arquivo a Modificar

| Arquivo | Mudança |
|---------|---------|
| `src/components/contacts/ContactMessages.tsx` | Ajustar maxHeight e corrigir classe |

---

## Mudanças Detalhadas

### ContactMessages.tsx

**Linha 177 - Função adjustTextareaHeight:**
```tsx
// DE:
const maxHeight = 150;

// PARA:
const maxHeight = 130; // ~6 linhas
```

**Linhas 641-643 - Classe do Textarea:**
```tsx
// DE:
className={`flex-1 resize-none min-h-[40px] max-h-[150px] ${
  textareaOverflow ? 'overflow-y-auto scrollbar-none' : 'overflow-hidden'
}`}

// PARA:
className={`flex-1 resize-none min-h-[40px] max-h-[130px] ${
  textareaOverflow ? 'overflow-y-auto scrollbar-hide' : 'overflow-hidden'
}`}
```

---

## Comportamento Final

1. Textarea começa com 1 linha
2. Expande até exatamente 6 linhas (130px)
3. Após 6 linhas, scroll interno funciona
4. Scrollbar fica completamente oculta (invisível)
5. Ao enviar, volta para 1 linha

---

## Checklist de Validação

- [ ] Textarea expande até 6 linhas (não mais)
- [ ] Scrollbar não aparece (fica oculta)
- [ ] Scroll interno funciona após 6 linhas
- [ ] Ao enviar, textarea volta para 1 linha
