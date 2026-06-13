## Contexto

A TAMIRIS aparece com gap de 553h (~23 dias) porque o inbound dela é de **20/05/2026**, mas o módulo de Atendimento (`/inbox`) só foi criado em **30/05/2026** (confirmado no histórico — mensagens #4210-#4215, primeira implementação read-only da fase 1).

Antes dessa data, ninguém via aquela conversa como "atendimento aberto", então não faz sentido contar o tempo até a primeira resposta — o relógio só deveria começar a partir do momento em que a tela existia.

## O que mudar

Criar uma constante única com a data de corte do Atendimento e aplicar em **todos** os KPIs que dependem de eventos antigos.

### 1. Nova constante

`src/lib/serviceCutoff.ts` (novo):
```ts
// Atendimento module went live on 2026-05-30 (see /inbox phase 1)
export const SERVICE_MODULE_START = new Date('2026-05-30T00:00:00-03:00');
export const SERVICE_MODULE_START_ISO = SERVICE_MODULE_START.toISOString();
```

### 2. `src/hooks/useServiceStats.ts`

Aplicar o cutoff em duas frentes:

- **Janela efetiva**: `effectiveFromIso = max(fromIso, SERVICE_MODULE_START_ISO)`. Usar `effectiveFromIso` em todos os filtros `.gte('created_at', ...)`, `.gte('resolved_at', ...)` e nas consultas a `message_response_times`.
- **1ª resposta por thread**: ao montar `firstByThread`, ignorar registros cujo `inbound_at < SERVICE_MODULE_START_ISO`. Assim, mesmo que um inbound antigo seja o "primeiro" da thread, ele não inflaciona a média.

Resultado: o caso TAMIRIS (inbound 20/05) deixa de entrar; threads com inbound antes de 30/05 só contam se houver inbound posterior (que vira o "primeiro" válido).

### 3. Sem mudanças visuais

Nenhuma alteração em UI, label ou tooltip nesta etapa. Apenas o cálculo passa a respeitar o cutoff.

## Fora de escopo

- Backfill de `first_response_at` no banco.
- Mostrar a data de corte na UI (pode virar próximo passo se quiser deixar explícito pro usuário).
- Mudanças em outros relatórios (Dashboard comercial, Marketing) — só `useServiceStats`.
