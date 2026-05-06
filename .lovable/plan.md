## Objetivo

Redesenhar o header da conversa em `/messages` para:
- Evitar que o nome do contato quebre/comprime quando há muitos botões.
- Reduzir o ruído visual encapsulando ações secundárias em um menu "Mais".
- Manter as ações mais usadas visíveis com hierarquia clara.

## Layout proposto

```text
[Avatar] Nome do Contato (truncate)  [status badge]   |  [Assumir] [Resolver] [Marcar Ganho ▾]  [⋯ Mais]
         +55 11 9999-9999 · Atribuída a Tamires        
```

- Lado esquerdo (`min-w-0 flex-1`) com `truncate` no nome → nunca mais quebra/comprime.
- Lado direito (`shrink-0`): só **3 ações primárias** + **1 menu "⋯ Mais"** com o restante.
- Ícone-only em telas estreitas (`< xl`), texto+ícone em telas largas (`xl:`).

## Hierarquia das ações

**Primárias (sempre visíveis no header):**
1. **Assumir** — quando não atribuída ao usuário atual e thread não resolvida.
2. **Resolver** — quando thread `open`/`awaiting_client`.
3. **Marcar Ganho/Perdido** — único botão verde com seta. Se há 1 oportunidade aberta, abre dropdown com as duas opções (Ganho/Perdido). Se há várias, lista todas com Ganho/Perdido por oportunidade. Some quando não houver oportunidade aberta.

**Secundárias (dentro do menu "⋯ Mais"):**
- Reabrir conversa (quando `resolved`).
- Devolver ao AI (quando `needs_human_attention` e há agente).
- Atribuir a... (submenu/itens com a lista de owners — mantém a função do `OwnerSelector` atual).
- Ver perfil do contato (link para `/contacts/:id`).
- Ocultar conversa (já existente em `ChatListItem` — útil ter aqui também).

## Implementação técnica

**Arquivo:** `src/pages/messages/MessagesList.tsx` (apenas o bloco do `Chat Header`, linhas ~1290-1425).

- Container externo: `flex items-center justify-between gap-4`.
- Bloco do contato: `flex items-center gap-3 min-w-0 flex-1` — o `min-w-0` é o que destrava o `truncate`.
  - Linha do nome: `<span className="font-semibold text-foreground truncate block">`.
  - Linha de subtítulo: `text-xs text-muted-foreground truncate`.
  - Badges (`Online`, status) ficam ao lado do nome com `shrink-0`.
- Bloco de ações: `flex items-center gap-2 shrink-0`.
  - Botões primários usam `size="sm"` com `<span className="hidden xl:inline">` no texto (ícone sempre visível, texto colapsa em telas menores).
  - "Marcar Ganho/Perdido" sempre vira `DropdownMenu` (mesmo com 1 oportunidade) para manter o header consistente — header do menu mostra título da oportunidade.
  - Menu "⋯ Mais" agrupa Reabrir, Devolver ao AI, Atribuir (com submenu de owners), Ver perfil, Ocultar conversa. Usa `DropdownMenuLabel` + `DropdownMenuSeparator` para organizar.
- O `OwnerSelector` atual sai do header e seu valor/onChange é usado dentro do menu "Atribuir a".

## Fora do escopo

- Não muda o layout da lista de conversas, nem o corpo do chat.
- Não altera mobile (`MobileMessagesList`).
- Sem mudanças em hooks ou queries — puramente reorganização do header.

## Arquivos modificados

- `src/pages/messages/MessagesList.tsx` (somente JSX do Chat Header e import de `DropdownMenuLabel` / `DropdownMenuSeparator`).
