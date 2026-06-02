## Corrigir truncamento do nome no header da conversa

### Problema
No header de `InboxThreadDetail`, o nome do cliente ("GUSTAVO ELEOTERIO DE PAULA") aparece truncado como "GUSTAV..." mesmo havendo bastante espaço horizontal disponível. O motivo é que o título e os subbadges (Cliente / endpoint) dividem a mesma coluna `flex-1`, enquanto o cluster de chips à direita (`WhatsAppWindowChip`, `InboxSlaChip`, status, botão Resolver) consome boa parte da linha e ainda força o título a competir com os badges abaixo.

### Mudanças (apenas em `src/components/inbox/InboxThreadDetail.tsx`)

1. **Dar mais espaço ao nome**
   - Manter o título `<h1>` numa única linha ocupando toda a largura disponível do bloco central (`flex-1 min-w-0`), com `truncate` só como fallback.
   - Mover os badges secundários ("Cliente", endpoint "other") para uma segunda linha abaixo do nome, mas sem ocupar o mesmo flex item que disputa espaço com o título.

2. **Compactar o cluster de chips à direita**
   - Reduzir o gap entre chips de `gap-2` para `gap-1.5`.
   - Permitir que o cluster quebre para uma segunda linha em telas estreitas (`flex-wrap justify-end`) em vez de empurrar o título.
   - Garantir `flex-shrink-0` apenas nos chips individuais, não no container, para que o título sempre tenha prioridade de largura.

3. **Aumentar levemente o tamanho do título**
   - Manter `text-[15px] font-semibold` mas garantir `whitespace-nowrap` + `overflow-hidden` + `text-ellipsis` apenas quando realmente não couber (caso extremo de nomes muito longos).

### Fora de escopo
- Nenhuma mudança na lista lateral, no painel direito, nos handlers de Resolver/Reabrir/Reatribuir, ou em qualquer lógica de dados.
- Sem mudança de layout geral, apenas reorganização interna do header.

### Arquivo tocado
- `src/components/inbox/InboxThreadDetail.tsx`
