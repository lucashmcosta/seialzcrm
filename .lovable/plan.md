## Manter "Janela aberta" inline com "Cliente" e "other"

Atualmente os badges secundários estão num container `flex-wrap`, então quando "Cliente · other · Janela aberta · expira em..." não cabe, o chip da janela quebra para uma segunda linha.

### Mudança (`src/components/inbox/InboxThreadDetail.tsx`)
- Remover `flex-wrap` da linha de badges abaixo do nome para forçar tudo em linha única.
- Adicionar `min-w-0` + `overflow-hidden` no container para que, em viewports muito estreitos, o conteúdo seja cortado em vez de quebrar.
- O nome em cima já está em sua própria linha com `truncate`; a linha de badges agora segue o mesmo padrão.

### Fora de escopo
Sem mexer em `WhatsAppWindowChip`, lógica, ou outros arquivos.
