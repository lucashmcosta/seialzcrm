
# Fase 1.2 — Ajustes de UI no `/inbox`

Apenas refinos visuais. Sem envio, sem composer, sem alterar /messages, RPC, migration, edge function, RLS ou regra de escopo.

## Diagnóstico do layout atual

Viewport 913px:
- Queues `w-[220px]` + ThreadList `w-[340px]` = **560px** consumidos antes do detalhe.
- Detalhe (`flex-1`) recebe **~353px**, e dentro dele o aside é `w-[320px]` → **chat real ≈ 33px**. Por isso a conversa some.

Causa do truncamento do nome no header: `<h2 ... truncate>` está numa flex row sem `min-w-0`, e os chips ao lado consomem espaço. Com `flex-1 min-w-0` o nome respira até o limite real.

---

## Arquivos a alterar (apenas UI)

### 1. `src/components/inbox/InboxThreadList.tsx`
- Reduzir de `w-[340px]` para `w-[300px]` para devolver largura ao chat sem perder densidade.

### 2. `src/components/inbox/InboxThreadDetail.tsx`
- **Header da thread**: envolver o nome em `<div className="flex-1 min-w-0">` e aplicar `truncate` só no `<h2>` interno. Empurrar SLA/status/priority/selo para a direita com `ml-auto` num grupo `flex items-center gap-2 flex-shrink-0`.
- **Selo read-only**: mover para o header (chip discreto `font-data text-[10px]` cinza), remove da subheader da timeline.
- **Chips de contexto**: adicionar no header, logo abaixo ou ao lado do nome:
  - `customer` quando `thread.contact?.lifecycle_stage === 'customer'`
  - `endpoint: <purpose>` quando `thread.primary_endpoint?.purpose` existir (mesmo que `other`)
- **Aside**: reduzir de `w-[320px]` para `w-[280px]`.
- **Coluna principal**: já é `flex-1 min-w-0` — manter. Agora respira corretamente.

### 3. `src/components/inbox/InboxConversationTimeline.tsx`
- **Subheader**: remover o selo "Somente leitura — Fase 1" daqui (passou pro header). Manter apenas rótulo "Conversa WhatsApp" discreto, ou eliminar a barra inteira para ganhar altura — preferência: eliminar.
- **Direção/remetente**: clareza visual dentro de cada bolha:
  - Inbound (cliente): bolha à esquerda, cor neutra (`bg-card`), label discreto acima `"Cliente"` (ou `contact.name` se vier por prop) em `text-[10px] text-muted-foreground`.
  - Outbound (empresa): bolha à direita, cor verde (mantém), label acima:
    - `sender_type === 'agent'` → "Agente IA · {sender_name}" 
    - `sender_type === 'user'` → "Atendente · {sender_name}"
    - sem `sender_*` → "Empresa"
  - Nota interna: mantém estilo âmbar centralizado.
- Manter `StatusIcon` somente leitura (sem mudança).
- Aceitar nova prop opcional `contactName?: string` para usar no label inbound.

### 4. `src/hooks/inbox/useInboxThread.ts`
- Expandir `THREAD_SELECT` para incluir os dados necessários ao header **sem mudar nenhuma regra de escopo**:
  ```
  + primary_endpoint_id,
  + contact:contacts ( id, name:full_name, phone, lifecycle_stage )
  + primary_endpoint:communication_endpoints ( id, purpose )
  ```
  (apenas leitura, mesmo padrão de `inboxScope.ts`)
- Atualizar tipo `InboxThreadRow` se necessário (importado de `useInboxThreads`/`inboxScope` — já tem `contact.lifecycle_stage` e `primary_endpoint.purpose`).

---

## Layout resultante (viewport 913px)

```
┌──────────┬──────────┬──────────────────────────────┬────────────┐
│ Queues   │ List     │ Conversa (dominante)         │ Aside      │
│ 220px    │ 300px    │ flex-1 (~113px+ no 913,      │ 280px      │
│          │          │  respira em telas maiores)   │            │
└──────────┴──────────┴──────────────────────────────┴────────────┘
```

Em 913px ainda fica apertado (viewport pequeno) — mas o chat passa de ~33px → ~113px e cresce linearmente com larguras maiores (1280px → ~480px de chat; 1440px → ~640px). Não vou forçar quebra responsiva nesta fase.

---

## Garantias

- `/messages` **intocado** (nenhum arquivo em `src/pages/messages/` ou `src/components/messages/`).
- `WhatsAppChat.tsx` **intocado**.
- `inboxScope.ts`, `useInboxThreads.ts`, `useInboxQueueCounts.ts` **intocados** (regra de escopo não muda).
- Sem composer, sem botão de envio, sem upload, sem template selector, sem edge function, sem Twilio/Meta.
- `useInboxThread.ts` ganha apenas colunas adicionais no SELECT já existente — não vira hook novo, não muda assinatura.
- Sem mudança de dados no banco.

---

## Arquivos alterados (resumo)

1. `src/components/inbox/InboxThreadList.tsx` — largura 340→300.
2. `src/components/inbox/InboxThreadDetail.tsx` — header refeito, chips, aside 320→280, selo read-only relocado.
3. `src/components/inbox/InboxConversationTimeline.tsx` — labels de direção, subheader simplificada, prop `contactName`.
4. `src/hooks/inbox/useInboxThread.ts` — SELECT estendido com `lifecycle_stage` e `primary_endpoint.purpose`.

Nada além disso.
