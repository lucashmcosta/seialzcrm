Ajustar o `EndpointBadge` (`src/components/messages/EndpointBadge.tsx`) para ficar mais visível e mudar o texto:

1. **Texto**: trocar `via …{suffix}` por `Novo · {suffix}` (ex.: `Novo · 7067`).
2. **Cor**: trocar o estilo atual (`bg-muted` + `text-muted-foreground` + `border-border`) por azul:
   - `bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30`
   - Manter o formato pill e os dois tamanhos (`sm` lista, `lg` header).
3. Manter a lógica de ocultação para números oficiais (`officialNumbers`) e o `title` com o endereço completo no hover.

Sem outras alterações — só o componente do badge.