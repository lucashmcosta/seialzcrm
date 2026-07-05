# ADR 0003 — BYOK (Bring Your Own Key) para providers de IA

**Status:** Aceito.
**Evidência:** `supabase/functions/byok-*`, `_shared/intelligence/byok-shared.ts`, `organization_integrations`, `intelligence_settings`.

## Contexto
Custo LLM significativo. Diferentes orgs preferem diferentes providers (Claude/OpenAI/Gemini) e querem controle sobre suas chaves.

## Decisão
- Chaves cifradas em `organization_integrations` (JSONB) via `_shared/crypto.ts`.
- Edge functions finas (`byok-set-key` = 84 LOC) delegando para `_shared/intelligence/byok-shared.ts`.
- Autz por `requireOrgAdmin`.
- Voyage AI também overridable por org via `organization_integrations` (fallback global `VOYAGE_API_KEY`).
- Fallback global: `LOVABLE_API_KEY` (Lovable AI Gateway) + `VOYAGE_API_KEY`.

## Consequências
- UI condicional dependendo do provider ativo.
- Multi-model com uniqueness por org.
- Padrão de "edge function fina + `_shared` grosso" adotado como referência para novas features.
