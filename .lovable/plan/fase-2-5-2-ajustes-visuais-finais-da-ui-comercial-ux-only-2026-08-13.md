# Fase 2.5.2 — Ajustes visuais finais da UI Comercial (UX only)

Somente frontend/apresentação. Nada de SQL, Supabase, Edge Functions, triggers, feature flags, resolver, hooks de dados, queries, Atendimento ou Mobile. Nenhuma mudança de comportamento: os mesmos gates, os mesmos dados, apenas tipografia, espaçamento, cor e composição.

## 1. Header menos achatado, nome mais dominante

No cabeçalho da conversa (`src/pages/messages/MessagesList.tsx`, bloco L1/L2/L3 ~1855–1893):

- Nome do contato: de `text-[15px] font-semibold` para `text-base font-semibold leading-tight` (peso máximo 600, conforme o design system).
- Padding vertical do cabeçalho um pouco mais generoso (`py-3` → `py-3.5`).
- Respiro entre as linhas: telefone/responsável logo abaixo do nome; a linha de badges ganha mais afastamento (`mt-1.5` → `mt-2.5`) em `SalesConversationMeta`, deixando os badges visivelmente "mais abaixo".
- Avatar mantém `size="md"`; nenhuma reordenação de elementos.

## 2. Chip de janela 24h: âmbar, menor, menos agressivo — sem tocar no Atendimento

`WhatsAppWindowChip` é compartilhado com Atendimento (`InboxThreadDetail`) e Mobile (`MobileInbox`), então o componente **não** muda de aparência por padrão. Adiciono uma prop opcional `tone?: 'default' | 'soft'` (default `'default'` = exatamente o visual atual) e o Comercial passa `tone="soft"`:

- `24h fechada · só template`: sai o `bg-destructive/15 text-destructive` e entra âmbar suave (`bg-amber-500/10 text-amber-700 dark:text-amber-400`), texto encurtado para `Sem inbound recente`, fonte `text-[10px]` mantida e chip mais compacto (`px-1.5`).
- `Sessão 24h` e chips CTWA no modo `soft`: mesmas cores, apenas sem `animate-pulse`, para reduzir ruído no cabeçalho comercial.
- Atendimento e Mobile continuam chamando sem a prop → pixel-idêntico.

## 3. Botão "Detalhes da rota" mais discreto

Em `MessagesList.tsx` e `SalesConversationHeader.tsx`: `variant="outline"` → `variant="ghost"`, `size="sm"`, texto em `text-xs text-muted-foreground`, ícone ⓘ mantido. Mesmo `onClick`/mesmo diálogo.

## 4. Ícone no número (8439)

Em `RouteIndicators.tsx` (`RouteBadge`), tanto `compact` quanto `split`: o ícone atual de telefone passa a ícone de WhatsApp (`WhatsappLogo` do Phosphor, já usado no projeto) quando o canal é WhatsApp — que é o caso do Comercial — mantendo `size={11}` e o tooltip com número + provider. Nenhuma mudança de texto ou de dados.

## 5. Avisos do composer usando o Alert do shadcn

`src/components/messages/route/SalesComposerStatus.tsx` passa a renderizar `Alert` + `AlertTitle` + `AlertDescription` (`src/components/ui/alert.tsx`) em vez do bloco manual:

- Variante âmbar via classes de token no `className` do `Alert` (borda/fundo âmbar suave), ícone `Warning`, `py` reduzido para caber acima do input.
- Textos inalterados: `Conversa legada` / "Responder somente após nova mensagem do cliente." e `Sem inbound recente` / "Somente mensagens de template estão disponíveis."
- As props (`noRoute`, `noRecentInbound`) e a lógica de gate em `MessagesList` continuam idênticas.

## Detalhes técnicos

Arquivos alterados:
- `src/pages/messages/MessagesList.tsx` (tipografia do nome, padding, `tone="soft"`, botão ghost)
- `src/components/messages/route/SalesConversationMeta.tsx` (espaçamento da linha de badges)
- `src/components/messages/route/SalesConversationHeader.tsx` (botão ghost)
- `src/components/messages/route/RouteIndicators.tsx` (ícone WhatsApp)
- `src/components/messages/route/SalesComposerStatus.tsx` (Alert shadcn)
- `src/components/inbox/WhatsAppWindowChip.tsx` (apenas nova prop opcional `tone`, default = visual atual)

Não alterados: `src/components/inbox/*` (fora da prop opcional acima), `src/components/mobile/*`, `EndpointBadge`, hooks, `supabase/`.

Validação: `tsgo --noEmit` + build. A conferência visual autenticada fica com você, como na Fase 2.5.1.
