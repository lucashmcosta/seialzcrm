# Plans — planos e specs de trabalho em andamento

Especificações de features/mudanças **ainda não concluídas** (ou concluídas há pouco, aguardando arquivamento). Diferente de `docs/audit/` (histórico congelado) e dos módulos (estado atual do sistema).

## Ciclo de vida

1. Plano nasce aqui com prefixo de data: `YYYY-MM-<slug>.md`.
2. Enquanto o trabalho está ativo, o plano é a spec de referência.
3. Quando implementado: o conteúdo permanente migra para o módulo/integração correspondente em `docs/modules/` ou `docs/integrations/`, e o plano é **apagado** (o histórico fica no Git) — ou mantido por no máximo um ciclo se ainda servir de referência de rollout.
4. Plano abandonado: apagar, registrando o motivo na mensagem de commit.

## Ativos

| Plano | Status |
|---|---|
| [`2026-07-snippets-internos.md`](2026-07-snippets-internos.md) | Snippets internos (respostas rápidas no composer) — em implementação; tabela `message_snippets` já existe |
| [`../inbox-v2/`](../inbox-v2/) | Inbox v2 — Fase 0/1 (SQLs versionados não aplicados + specs de cutover). Mantido em pasta própria por conter SQL numerado |
