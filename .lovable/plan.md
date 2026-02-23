
# Fix: Adicionar opcao "Tornar persuasivo" no chat do perfil do contato

## Problema

O componente `ContactMessages.tsx` (linha 746) tem apenas 3 opcoes no menu de melhoria de texto com AI:
- Corrigir gramatica
- Tornar profissional
- Tornar amigavel

Falta a 4a opcao **"Tornar persuasivo"** que ja existe no `MessagesList.tsx` (linha 1512).

## Correcao

Adicionar o item de menu "Tornar persuasivo" no `DropdownMenuContent` do `ContactMessages.tsx`, logo apos "Tornar amigavel" (depois da linha 746):

```tsx
<DropdownMenuItem onClick={() => handleImproveText('persuasive')}>
  <Target className="w-4 h-4 mr-2" />
  {locale === 'pt-BR' ? 'Tornar persuasivo' : 'Make persuasive'}
</DropdownMenuItem>
```

Tambem verificar se o icone `Target` ja esta importado no componente. Se nao, adicionar ao import do `lucide-react`.

## Arquivo modificado

| Arquivo | Mudanca |
|---------|---------|
| `src/components/contacts/ContactMessages.tsx` | Adicionar opcao "Tornar persuasivo" no dropdown e importar icone `Target` se necessario |
