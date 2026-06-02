## Pacote de acabamento — Tela de Atendimento (Inbox)

Entrega única, sem novas fases. Tudo aplicado em uma rodada e auditado ao final.

---

### 1. Indicador forte da janela WhatsApp (header)

Arquivo: `src/components/inbox/InboxThreadDetail.tsx`

- Criar componente local `WhatsAppWindowChip` exibido no header da conversa, à direita do nome (antes do `InboxSlaChip`).
- Cálculo: `last_inbound_at || whatsapp_last_inbound_at` + 24h.
- Estados:
  - Aberta: chip verde (`bg-emerald-500/15 text-emerald-700 dark:text-emerald-300`, ponto pulsante) — texto: `"Janela aberta · expira em 7h 12m"`.
  - Próxima do fim (<2h): mesma cor base, ponto âmbar — texto: `"Janela aberta · expira em 42m"`.
  - Fechada: chip vermelho — texto: `"Fora da janela 24h · só template"`.
  - Sem inbound: chip neutro — `"Sem inbound · só template"`.
- Atualização a cada 60s via `setInterval` para o countdown.
- Apenas para `channel === 'whatsapp'`.
- Manter o aviso compacto que já existe dentro do composer (não duplicar visual, só simplificar).

---

### 2. Painel lateral — explicar por que está em Atendimento

Arquivo: `src/components/inbox/InboxThreadDetail.tsx` + `src/hooks/inbox/useInboxThread.ts`

Nova seção no painel direito, acima de "Dados da conversa":

```
ATENDIMENTO
Tipo do contato   Cliente
Origem            Oportunidade ganha · "<nome da opp>"
Convertido em     12/04/2026
Endpoint          other
```

Dados:
- Tipo: derivado de `contact.lifecycle_stage`.
- Origem + data: buscar a oportunidade `won` mais recente do contato (`opportunities` onde `contact_id = thread.contact_id and status = 'won' order by won_at desc limit 1`). Estender `useInboxThread` para incluir essa query em paralelo (`latest_won_opportunity`).
- Endpoint: `thread.primary_endpoint.purpose`.
- Quando não houver opp ganha: mostrar `"Origem: —"` e ocultar a data.

Não criar tabela nem migration — usa dados existentes.

---

### 3. UX de Reply visível e intuitiva

Arquivo: `src/components/inbox/InboxConversationTimeline.tsx`

- Remover `opacity-0 group-hover:opacity-100`.
- Botão "Responder" sempre visível mas discreto: ícone com `text-muted-foreground/60 hover:text-foreground hover:bg-muted rounded p-1`.
- Em mobile (`md:` breakpoint) o botão fica em tamanho touch friendly (`p-1.5`).
- Ordem: botão sempre ao lado oposto da bolha (já está correto via `flex-row-reverse`).
- Tooltip via `title="Responder"` mantido.

---

### 4. Realtime completo do header e do thread

Arquivo: `src/hooks/inbox/useInboxThread.ts`

Adicionar subscription Realtime:
- Canal: `inbox-thread-${threadId}`.
- Evento: `UPDATE` em `public.message_threads` com filter `id=eq.${threadId}`.
- Handler: aplicar o payload novo no estado `thread` (merge), sem refetch — assim `assigned_user_id`, `status`, `priority`, `last_inbound_at`, `resolved_at`, SLAs e demais campos atualizam em tempo real.
- Para histórico de atribuição: subscription separada em `thread_assignment_history` com filter `thread_id=eq.${threadId}` (INSERT) → prepend no array `history`.
- Cleanup correto no `useEffect` (remover canal ao trocar de thread/desmontar).
- Manter `refresh()` para casos manuais (ex: após reassign local) mas sem dependência dele para ver mudanças de outros usuários.

---

### 5. Auditoria final (entregue como mensagem após implementação)

Após aplicar, responder com:

**Campos carregados (consulta principal `useInboxThread`):**
`id, contact_id, channel, status, priority, organization_id, assigned_user_id, assigned_at, first_response_at, sla_first_response_target_at, sla_resolution_target_at, last_message_at, last_message_content, last_message_direction, resolved_at, last_inbound_at, whatsapp_last_inbound_at, primary_endpoint_id, contact{id, full_name, phone, lifecycle_stage}, primary_endpoint{id, purpose, external_address}` + (novo) `latest_won_opportunity{id, name, won_at}`.

**Derivados na UI:**
- `isIn24hWindow` (composer + header chip)
- `windowExpiresIn` (countdown texto)
- `senderLabel` (timeline)
- `lifecycleBadge`/origem (painel)
- `slaStatus` (`InboxSlaChip`)

**Consultas alteradas:**
- `useInboxThread`: adicionada query paralela em `opportunities` para origem.
- Adicionadas 2 subscriptions Realtime (UPDATE em `message_threads`, INSERT em `thread_assignment_history`).

**Migration:** nenhuma. Apenas frontend.

**Performance:**
- +1 query leve por thread aberta (LIMIT 1 indexado por `contact_id`).
- Realtime: 2 canais por thread aberta, fechados ao trocar — sem leak.
- Chip de janela: 1 `setInterval(60_000)` por thread aberta.

**Screenshots finais:** capturadas no preview após build, mostrando header com chip verde/vermelho, painel lateral com seção "Atendimento" e botão de reply sempre visível.

---

### Fora de escopo (explícito)
- Sem nova migration.
- Sem mudanças em edge functions, envio Twilio ou regras de negócio.
- Sem novas rotas ou páginas.