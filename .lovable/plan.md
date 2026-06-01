
# Fase 1.2 — Refinamento visual final do header `/inbox`

Escopo: apenas `src/components/inbox/InboxThreadDetail.tsx`. Nenhum outro arquivo é necessário.

## Mudanças

### 1. Truncamento do nome
Hoje, o bloco do nome está em `flex items-center gap-3` competindo com `InboxSlaChip + status + priority`. O `flex-1 min-w-0` está aplicado, mas o grupo direito (`flex-shrink-0`) ainda reserva muita largura por conta dos múltiplos chips. Para devolver largura ao nome:

- Manter `flex-1 min-w-0` no bloco esquerdo.
- Reduzir o grupo direito: SLA chip e status/priority com `text-[10px]` já compactos; nada muda na largura, mas o nome estará isolado em sua própria linha (ver item 3), eliminando concorrência por largura horizontal.
- `<h2 className="text-base font-semibold text-foreground truncate" title={name}>` permanece — agora ele tem 100% da largura útil disponível para si.

### 2. Consolidar metadados em UMA linha discreta
Substituir os 3 chips empilhados (`customer`, `endpoint: other`, `Somente leitura · Fase 1`) por **um único parágrafo inline** separado por `·`:

```
customer · endpoint: other · somente leitura
```

- Renderização: `<p className="text-[11px] text-muted-foreground truncate">` com partes unidas por ` · `.
- Apenas inclui as partes que existem (sem `lifecycle_stage`, omite "customer"; sem `endpoint.purpose`, omite a parte).
- "somente leitura" sempre presente (constante da Fase 1).

### 3. Densidade vertical
- Substituir `py-2` por `py-1.5` no container do header.
- Reduzir `mt-0.5` da linha de metadados para `mt-0` (a tipografia menor já cria respiro).
- Trocar a estrutura interna do bloco esquerdo de `<div>...<h2>...<div chips>` para `<h2>` + `<p meta>` empilhados sem gap explícito.
- O grupo direito (SLA/status/priority) continua centralizado verticalmente sobre as 2 linhas (nome + meta), via `flex items-center`.

Altura resultante estimada: ~44–48px (antes ~68–72px com chips empilhados).

### 4. Garantias de não-regressão
- ThreadList permanece `w-[300px]`.
- Aside permanece `w-[280px]`.
- Coluna central permanece `flex-1 min-w-0`.
- Timeline ganha ~24px de altura útil.

### 5. Nenhuma mudança funcional
- Sem mudança em hooks, RPCs, edge functions, migrations, RLS, composer, envio, `/messages`, `WhatsAppChat.tsx`, `inboxScope.ts`, `useInboxThreads.ts`, `useInboxQueueCounts.ts`, `useInboxThread.ts`, `InboxConversationTimeline.tsx`, `InboxThreadList.tsx`, `InboxQueues.tsx`.

## Arquivo alterado
- `src/components/inbox/InboxThreadDetail.tsx` (apenas o JSX do header).

Nada além disso.
