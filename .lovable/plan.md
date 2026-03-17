

## Ajuste: Botões de ação retangulares no Contact Detail Mobile

O plano aprovado anteriormente previa botões circulares para as ações (Mensagens, Ligar, Email, Mais). O usuário quer que sejam **retangulares**, seguindo o design system Seialz (border-radius: 6px).

### Mudança em `src/pages/contacts/ContactDetail.tsx`

**Substituir o bloco de ações (linhas 310-352) por 4 botões retangulares em linha:**

```tsx
<div className="flex items-center justify-center gap-3 px-4 pb-4">
  <Button color="secondary" size="sm" onClick={() => navigate(`/messages?contact=${contact.id}`)}>
    <ChatCircle className="h-4 w-4 mr-1.5" />
    Mensagens
  </Button>
  <Button color="secondary" size="sm" onClick={() => handleCall()}>
    <Phone className="h-4 w-4 mr-1.5" />
    Ligar
  </Button>
  {contact.email && (
    <Button color="secondary" size="sm" asChild>
      <a href={`mailto:${contact.email}`}>
        <EnvelopeSimple className="h-4 w-4 mr-1.5" />
        Email
      </a>
    </Button>
  )}
  <DropdownMenu>
    <DropdownMenuTrigger asChild>
      <Button color="secondary" size="sm">
        <DotsThree className="h-4 w-4" />
      </Button>
    </DropdownMenuTrigger>
    {/* Menu existente com Editar/Excluir */}
  </DropdownMenu>
</div>
```

- Botões usam `color="secondary"` (outline/fundo sutil) com `rounded-md` (6px) conforme o design system
- Texto + ícone lado a lado, compactos
- "Mais" (⋯) mantém o DropdownMenu com Editar e Excluir

**Também substituir o NativeSelect (linhas 354-363) por tabs horizontais com scroll** conforme plano anterior aprovado.

### Arquivo afetado
| Arquivo | Mudança |
|---------|---------|
| `src/pages/contacts/ContactDetail.tsx` | Botões retangulares + tabs horizontais |

