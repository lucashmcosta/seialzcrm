# Menu Comercial não aparece logo após conectar o WhatsApp

## O que está acontecendo

A regra do menu já reconhece números Evolution. O problema é o tempo: o sistema guarda a resposta "esta conta não tem WhatsApp" por 10 minutos e não refaz a pergunta quando um número é conectado. Na conta Isenção IR, o menu foi carregado antes do número ficar ativo, então o "não" ficou guardado. Ao entrar direto em /commercial, a tela abriu (ela não depende dessa regra) e, com o tempo ou o recarregamento, o menu passou a aparecer.

Confirmado no código: nenhuma das ações de conectar/provisionar número (Evolution, rotas comerciais) atualiza essa informação do menu.

## O que vou fazer

1. Quando a resposta for "sem WhatsApp", verificar de novo com frequência (a cada 30 segundos e ao voltar para a aba), em vez de guardar por 10 minutos. Quando for "com WhatsApp", mantém como hoje.
2. Ao conectar, provisionar ou ativar um número (Evolution e tela WhatsApp Comercial), atualizar imediatamente a informação do menu.

Resultado: o Comercial aparece logo que o número fica ativo, sem precisar digitar o endereço ou recarregar. Nada muda em envio, roteamento ou permissões.

## Detalhes técnicos

- `src/hooks/useWhatsAppIntegration.ts`: `staleTime` dinâmico na query `whatsapp-any-enabled` (`false` → 30s + `refetchOnWindowFocus`; `true` → 10 min).
- `src/hooks/useEvolutionProvisioning.ts`, `src/hooks/useEvolutionInstances.ts`, `src/hooks/settings/useSalesRouteManager.ts` (`invalidate`): adicionar `invalidateQueries({ queryKey: ['whatsapp-any-enabled'] })`.
- Sem migration, RLS ou Edge Function.
