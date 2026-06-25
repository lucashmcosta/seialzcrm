Plano para corrigir o scroll da conversa na aba Mensagens do contato:

1. Ajustar a cadeia de altura no desktop da página de contato
   - Trocar o wrapper principal da página de `h-full` para uma altura travada no viewport disponível (`h-[calc(100vh-var(--layout-offset...))]` ou equivalente seguro no layout atual).
   - Manter apenas a área da aba Mensagens com `overflow-hidden`, sem afetar as outras abas.

2. Garantir que todos os pais do chat permitam scroll interno
   - Preservar `flex flex-col min-h-0` no wrapper da aba Mensagens.
   - Adicionar/confirmar `overflow-hidden` no `Tabs.Panel` de Mensagens para impedir que o scroll vaze para a página.
   - Manter o input fora da área rolável para continuar fixo no rodapé do chat.

3. Corrigir a área rolável do histórico
   - No `ContactMessages.tsx`, deixar o histórico como o único container com `overflow-y-auto` e altura flexível real.
   - Adicionar `overscroll-contain` e padding inferior suficiente para a última mensagem não ficar colada no input.
   - Manter o `scrollRef` no fim da lista para continuar rolando automaticamente ao carregar/enviar mensagens.

4. Validar visualmente
   - Confirmar que, em conversa extensa, o input fica fixo.
   - Confirmar que o scroll acontece dentro do histórico da conversa, não na página inteira.
   - Não alterar backend, envio de mensagem, templates, áudio ou outras abas.