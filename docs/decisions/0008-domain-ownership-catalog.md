# ADR 0008 — Ownership por domínio em `reference/catalog.md`

**Status:** Aceito, formato markdown por decisão consciente (revisitar quando houver time).
**Evidência:** `docs/reference/catalog.md`.

## Contexto
Com 117 tabelas, 107 triggers e 88 edge functions, faltava um mapa único de "quem é o dono deste objeto" — perguntas do tipo "qual módulo cuida de `capi_event_log`?" tomavam grep no repo inteiro.

## Decisão
- Um catálogo único em `docs/reference/catalog.md` mapeia domínio → (tabelas principais, edge functions, triggers-chave).
- **Formato markdown** (tabela) por simplicidade — fácil de editar/ler.
- **Regra:** objeto novo no banco/repo sem linha no catálogo = documentação incompleta.
- **Não promover a YAML+CI por enquanto** — a fricção de escrita hoje mataria a adoção. Reavaliar quando houver time dedicado a doc automatizada.

## Consequências
- Onboarding e triagem de incidentes ganham um índice único.
- Enforcement é humano (revisão de PR), não automatizado.
- Migração futura para YAML+CI está prevista mas não bloqueia a adoção agora.
