# Comercial sempre visível no menu (igual ao Atendimento)

## O que está acontecendo

O item **Comercial** só aparece quando o sistema detecta um número de WhatsApp ativo, e essa resposta fica guardada por 10 minutos sem ser atualizada quando um número é conectado. Por isso, na Isenção IR, o número já estava ativo no Evolution e o menu não mostrava o Comercial; entrando direto em /commercial a tela abriu normalmente. O Atendimento não tem essa condição — aparece sempre.

## O que vou fazer

1. **Menu**: o Comercial passa a aparecer sempre, no computador e no celular, no mesmo lugar de hoje — igual ao Atendimento. Continua respeitando a permissão do perfil (quem não pode ver Conversas comerciais segue sem o item).
2. **Aviso na tela Comercial**: quando a conta não tiver nenhum número de WhatsApp ativo, mostrar uma faixa discreta no topo: "Nenhum número de WhatsApp ativo para o Comercial. Conecte um número em Configurações → WhatsApp Comercial." (com botão para Configurações para quem pode gerenciar). A lista de conversas continua funcionando normalmente.
3. **Atualização imediata**: ao conectar/provisionar um número, a informação "tem número ativo" é atualizada na hora (e reconferida com frequência enquanto estiver "sem número"), para o aviso sumir sem recarregar.

Nada muda em envio, roteamento, permissões ou banco. Modelos e Respostas Rápidas em Configurações continuam dependendo de haver número ativo.

## Detalhes técnicos

- `src/components/Layout.tsx` (Seialz e padrão) e `src/components/mobile/MobileLayout.tsx`: remover a condição `hasWhatsApp` do item `/commercial`; `areaAllowed` segue filtrando.
- Página Comercial (`/commercial`, lista de mensagens): banner usando `hasWhatsApp` de `useWhatsAppIntegration` (só após `loading` terminar, para não piscar).
- `src/hooks/useWhatsAppIntegration.ts`: `staleTime` curto (30s) + `refetchOnWindowFocus` quando o resultado for `false`.
- `useEvolutionProvisioning.ts`, `useEvolutionInstances.ts`, `settings/useSalesRouteManager.ts`: invalidar `['whatsapp-any-enabled']` após conectar/ativar.
- Registrar a tarefa em `roadmap.md`. Sem migration, RLS ou Edge Function.
