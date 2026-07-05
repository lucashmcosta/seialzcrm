# ADR 0009 — Separação Inbox e Messages

**Status:** Aceito (decisão de negócio, 2026-07-05).
**Evidência:** `message_threads.business_context`, `communication_endpoints.purpose` (`src/lib/endpointPurpose.ts`), `senderContext` em `src/lib/dispatchWhatsAppSend.ts`.
**Documento vivo de detalhe:** [`product/channel-boundaries.md`](../product/channel-boundaries.md).

## Contexto

`/inbox` e `/messages` lidam ambos com mensagens e compartilham as mesmas tabelas (`message_threads`, `messages`), mas representam **áreas de negócio diferentes**. O Inbox v2 nasceu como evolução técnica da superfície de conversas, o que gerou leituras equivocadas de que `/messages` seria "legado" a ser substituído.

## Decisão

- **Inbox** (`/inbox`) = Atendimento / Customer Success / pós-venda — clientes ativos.
- **Messages** (`/messages`) = Comercial / Vendas / pré-venda — leads e oportunidades.
- **Os módulos não devem ser fundidos**, nem tratados como duplicidade, nem alvo de propostas de consolidação futura. O que é "legado" é apenas o caminho técnico de ingestão ([ADR-0004](0004-inbound-events-queue.md)), não o módulo Messages.

## Consequências

- **Ownership separado** — dono comercial da conversa (round-robin comercial) × fila/atribuição de atendimento.
- **SLAs separados** — indicadores comerciais × SLA de atendimento (`/settings/customer-service`).
- **Permissões separadas** — vendedores não veem suporte; atendentes não veem negociações.
- **Métricas separadas** — conversão/avanço de pipeline × resolução/`message_response_times`; unificar contaminaria os dois relatórios.
- **Roteamento separado** — `business_context` da thread + `purpose` do endpoint decidem por onde a org fala; re-rota "sales → endpoint comercial" só vale em `/messages` (detalhe em `channel-boundaries.md`).
