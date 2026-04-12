-- Performance: Indices compostos para eliminar table lookups nas queries mais frequentes
--
-- CONTEXTO:
-- O banco tem indices individuais em user_organizations(user_id) e (organization_id),
-- mas a funcao RLS sempre filtra por 3 colunas: user_id + organization_id + is_active.
-- Com indices separados, PostgreSQL faz index scan + table lookup (heap fetch).
-- Com indice composto, resolve tudo no indice (index-only scan).
--
-- NUMEROS ATUAIS:
--   users: 38 registros, 830M seq scans
--   messages: 27K registros, 33M seq scans
--   user_sessions: 139 registros, 362K seq scans
--
-- REFERENCIA:
-- Covering indexes sao a abordagem padrao para otimizar RLS em multi-tenant:
-- https://www.postgresql.org/docs/current/indexes-index-only-scans.html

-- ============================================================
-- 1. INDICE COMPOSTO EM user_organizations
-- Cobre exatamente o WHERE da funcao user_has_org_access()
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_orgs_user_org_active
  ON public.user_organizations(user_id, organization_id, is_active);

-- ============================================================
-- 2. INDICE EM messages PARA queries org-scoped
-- A query principal (52% do tempo do banco) filtra por thread_id
-- mas RLS avalia organization_id para cada linha.
-- Partial index so indexa mensagens nao deletadas.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_messages_org_thread
  ON public.messages(organization_id, thread_id, sent_at DESC)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 3. INDICE EM message_threads PARA queries sem filtro de channel
-- O indice existente inclui channel no meio: (org, channel, updated_at, id)
-- Queries que nao filtram por channel nao aproveitam bem.
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_threads_org_updated
  ON public.message_threads(organization_id, updated_at DESC, id);

-- ============================================================
-- 4. INDICE EM user_sessions PARA o polling de sessao
-- useSingleSession faz query a cada 30s: WHERE user_id = X ORDER BY last_seen_at DESC
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_user_sessions_user_lastseen
  ON public.user_sessions(user_id, last_seen_at DESC);
