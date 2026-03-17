

## Ajustes Mobile: Contact Detail

### Problemas identificados (screenshot)

1. **Header do contato** — email + telefone ficam apertados na linha, tag (badge) precisa de mais espaço
2. **Aba Chamadas (`ContactCalls`)** — header com título + botões "Ligar"/"Agendar"/"Registrar" transborda em 390px; tabs desktop (Todas/Feitas/Recebidas/Agendadas) não cabem
3. **Aba Timeline (`ActivityTimeline`)** — layout `flex justify-between` coloca título e timestamp lado a lado, texto fica cortado em 390px

### Plano

**1. `src/pages/contacts/ContactDetail.tsx` — Header mobile do contato**
- Email e telefone: empilhar verticalmente ao invés de inline com `·`
- Dar mais respiro ao badge de lifecycle stage

**2. `src/components/contacts/ContactCalls.tsx` — Layout mobile**
- Detectar `useIsMobile()`
- No mobile: empilhar título e botões de ação verticalmente (título em cima, botões abaixo em linha com wrap)
- Trocar `TabsList` desktop por chips/scroll horizontal ou `overflow-x-auto` nos filtros
- Nos cards de chamada: empilhar data abaixo do título (em vez de `justify-between` na mesma linha)

**3. `src/components/contacts/ActivityTimeline.tsx` — Layout mobile**
- Detectar `useIsMobile()`
- No mobile: empilhar timestamp abaixo do título (em vez de `flex justify-between`)
- Reduzir gap entre ícone e conteúdo

### Arquivos afetados
| Arquivo | Mudança |
|---------|---------|
| `src/pages/contacts/ContactDetail.tsx` | Melhorar header mobile (email/phone empilhados) |
| `src/components/contacts/ContactCalls.tsx` | Layout responsivo para header, botões e filtros |
| `src/components/contacts/ActivityTimeline.tsx` | Empilhar título+timestamp no mobile |

