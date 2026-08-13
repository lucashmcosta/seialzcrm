# Checklist visual da Fase 2.5.1 — verificação e captura

Nada de backend. Nenhuma alteração de código prevista: este é um plano de **verificação**. Se um item falhar, a correção é apenas de apresentação e volto para aprovação antes de mexer.

## Estado já confirmado por inspeção de código (read-only, feito agora)

| # | Item | Evidência no código | Situação |
|---|---|---|---|
| 1 | Lista mostra só a canônica (sem losers) | `MessagesList.tsx` L1582-1608: `visibleThreads` filtra `consolidatedThreadIds` (threads com `merged_into_thread_id`) | OK |
| 2 | Cabeçalho sem duplicidade | L1852-1900: só L1 (nome+status), L2/L3 via `SalesConversationMeta`. Removidos linha textual "Route · número · provider", `EndpointStatusChip` solto e histórico de endpoints | OK |
| 3 | Nome do cliente dominante | `text-[15px] font-semibold text-foreground`; telefone/responsável em `text-xs text-muted-foreground`; badges `text-[10px]` | OK |
| 4 | Badge da lista = 📱 8439 | L237: `RouteBadge variant="compact"` → ícone + `last4`; provider apenas no `title` | OK |
| 5 | Provider só no painel/modal | `SalesConversationMeta` não renderiza provider; `ProviderChip` usado apenas em `SalesRoutePanel` e na seção de Configurações | OK |
| 6 | Botão "Detalhes da rota" | `Button variant="outline" size="sm"` + `Info`, `setRouteDetailsOpen(true)` → `SalesRouteDetailsDialog` | OK (abertura a confirmar em runtime) |
| 7 | Painel como CRM Card | `SalesRoutePanel.tsx`: card de topo (Rota/Número/Status/Provider) → Histórico de endpoints → linhas técnicas | OK |
| 8 | Composer só com avisos novos | L2400-2406: `SalesComposerStatus` (`Conversa legada` / `Sem inbound recente`) | OK, com 1 ressalva |
| 9 | Configurações → Integrações → WhatsApp Comercial | `SalesWhatsAppSettingsSection` montada em `IntegrationsSettings`; status informativo sem toggle | OK (revisão visual pendente) |
| 10 | Atendimento intacto | `EndpointBadge` só em `src/components/inbox/*`; nenhum arquivo de `inbox/` ou `mobile/` alterado na Fase 2.5.1 | OK |

**Ressalva do item 8:** o banner técnico foi removido, mas o texto "Fora da janela — selecione um template" ainda aparece como `title`/placeholder do seletor de template (L2439 e L2507) — comportamento pré-existente do modo template-only. Posso trocar esse texto por linguagem de operador, se você quiser.

## O que falta: captura visual

Os itens 1, 6, 7, 9 e 10 só ficam 100% fechados com tela. O Supabase deste projeto é externo/não gerenciado, então o preview não injeta sessão — a captura autenticada depende de você estar logado no preview ou de credenciais de teste.

Sequência de captura (Playwright no preview, sem escrita em dados):

```text
1. /commercial            → lista lateral (badge 📱 + ausência de losers)
2. /commercial (thread)   → cabeçalho 3 linhas + composer
3. clique "Detalhes da rota" → modal aberto
4. painel lateral da rota → CRM Card
5. /settings/integrations → seção WhatsApp Comercial
6. /inbox                 → Atendimento, para comparação lado a lado
```

Entrega: 6 screenshots + o quadro acima com PASS/FAIL por item e, no caso do Atendimento, o par antes/depois em paralelo.

## Pré-requisito para eu executar

Preciso de um caminho de sessão autenticada no preview (login já ativo por você ou usuário/senha de teste). Sem isso, entrego apenas as telas públicas e declaro explicitamente quais itens ficaram como "verificado por código, sem screenshot".
