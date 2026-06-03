# Separadores de data nas conversas

Hoje a timeline de atendimento mostra apenas a hora em cada mensagem. Quando a conversa atravessa vários dias, fica impossível saber quando cada bloco ocorreu — exatamente o que o WhatsApp resolve com aquele "chip" de data no centro (22/05/2026, 25/05/2026, etc.).

## O que muda

Inserir um **chip de data centralizado** entre mensagens sempre que o dia mudar em relação à mensagem anterior (e também antes da primeira mensagem).

Formato do rótulo (pt-BR):
- Mesmo dia → **Hoje**
- Dia anterior → **Ontem**
- Últimos 7 dias → nome do dia da semana (ex.: **Segunda-feira**)
- Mais antigo → **DD/MM/AAAA**

## Onde aplicar

- `src/components/inbox/InboxConversationTimeline.tsx` — timeline principal do Atendimento (a tela do print).
- `src/components/whatsapp/WhatsAppChat.tsx` — mesma lógica, para manter consistência no chat antigo de WhatsApp usado em outros pontos do CRM.
- `src/components/mobile/MobileMessagesList.tsx` — versão mobile, para o app PWA não ficar diferente.

## Detalhes técnicos

- Comparação por dia local (`toDateString()` de `sent_at`) entre `messages[idx]` e `messages[idx-1]`; renderiza o chip quando muda ou quando `idx === 0`.
- Componente visual leve, inline: pílula centralizada com tokens semânticos do design system (`bg-muted text-muted-foreground`, `rounded-full`, `text-[11px]`, `px-3 py-1`, sombra suave), sem cores fixas — respeitando o tema claro/escuro Seialz.
- Notas internas e mensagens normais contam para a mesma régua de dia (uma nota interna ainda dispara o separador se mudar o dia).
- Nenhuma mudança de dados, hooks, contexto, RLS ou edge function. É puramente apresentação.

## Fora de escopo

- Não mexer no agrupamento de mensagens consecutivas (2 min) já existente.
- Não alterar formato da hora dentro do balão.
- Não tocar em lógica de janela 24h, status, leitura, SLA.
