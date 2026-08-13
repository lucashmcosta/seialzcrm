# Fase 2.5.1 — encerramento: registro de validação visual manual

Implementação considerada concluída. Nenhuma alteração de código nesta fase. Nenhuma tentativa de login de teste, Playwright autenticado ou infraestrutura para screenshots.

## Verificado por inspeção de código (fechado)

| # | Item | Evidência |
|---|---|---|
| 1 | Lista mostra só a canônica (sem losers) | `MessagesList.tsx` L1582-1608: `visibleThreads` filtra `consolidatedThreadIds` (`merged_into_thread_id`) |
| 2 | Cabeçalho sem duplicidade | L1852-1900: L1 nome+status, L2/L3 via `SalesConversationMeta`; removidos linha "Route · número · provider", `EndpointStatusChip` solto e histórico de endpoints |
| 3 | Nome do cliente dominante | `text-[15px] font-semibold text-foreground` vs. `text-xs text-muted-foreground` e badges `text-[10px]` |
| 4 | Badge da lista = 📱 8439 | L237 `RouteBadge variant="compact"`; provider apenas no `title` |
| 5 | Provider só no painel/modal | `ProviderChip` restrito a `SalesRoutePanel`, modal e seção de Configurações |
| 6 | Painel como CRM Card | `SalesRoutePanel.tsx`: card de topo → histórico de endpoints → linhas técnicas |
| 7 | Composer com avisos novos | L2400-2406 `SalesComposerStatus` (`Conversa legada` / `Sem inbound recente`) |
| 8 | Atendimento intocado | `EndpointBadge` exclusivo de `src/components/inbox/*`; nenhum arquivo `inbox/` ou `mobile/` alterado |

## Pendente exclusivamente de validação visual manual (você)

1. Lista Comercial — uma conversa por contato, badge compacta limpa.
2. Cabeçalho da conversa — hierarquia de 3 linhas, zero duplicidade.
3. Modal "Detalhes da rota" — abertura pelo botão ⓘ e conteúdo técnico.
4. Painel lateral — leitura tipo CRM Card.
5. Configurações → Integrações → WhatsApp Comercial — consistência visual, status informativo sem toggle.
6. Comparação lado a lado com Atendimento (`/inbox`) — nenhuma regressão visual.

## Único ajuste autorizado, a aplicar após sua validação

Linguagem do modo template-only em `src/pages/messages/MessagesList.tsx` (`outOfWindowCopy`, usado como texto/tooltip/placeholder nas L2396, L2439 e L2507):

```text
antes:  Fora da janela — selecione um template
depois: ⚠ Sem inbound recente
        Somente mensagens de template estão disponíveis.
```

Apenas texto — sem mudança de gate, layout, comportamento ou arquitetura. Só executo quando você der o OK após a validação visual.
