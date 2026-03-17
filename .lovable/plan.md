

## Ajustes Mobile: Contact Detail Header

### Problemas (screenshot)
1. **Barra de scroll feia** — visível no conteúdo das tabs
2. **Botão "Editar" separado** — deve ficar dentro do menu dos três pontos (⋯)
3. **Tag/badge** — deve ficar ao lado do nome, não abaixo

### Mudanças em `src/pages/contacts/ContactDetail.tsx`

**1. Nome + Badge na mesma linha**
- Trocar layout vertical por `flex items-center gap-2` com nome + badge lado a lado

**2. Mover "Editar" para dentro do DropdownMenu**
- Remover o `<Button>` de editar separado
- Adicionar um `<DropdownMenuItem>` de editar dentro do menu dos três pontos (antes do delete)
- O botão dos dots fica sozinho centralizado

**3. Esconder scrollbar**
- Adicionar classes CSS para esconder a scrollbar no container `overflow-auto` das tabs: `scrollbar-hide` ou estilo inline `[&::-webkit-scrollbar]{display:none}` + `-ms-overflow-style:none` / `scrollbar-width:none`

### Arquivo afetado
| Arquivo | Mudança |
|---------|---------|
| `src/pages/contacts/ContactDetail.tsx` | Linhas 284-350: badge ao lado do nome, editar no menu dots, esconder scrollbar |

