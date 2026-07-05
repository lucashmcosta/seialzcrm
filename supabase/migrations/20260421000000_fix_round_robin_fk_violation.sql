-- ============================================================================
-- FIX CRITICO: FK violation em contacts INSERT via round-robin trigger
-- ============================================================================
--
-- Contexto:
-- A funcao trg_contacts_round_robin() original executava um INSERT em
-- activities (com FK para contacts.id) dentro de um trigger BEFORE INSERT.
-- Row do contato ainda nao esta visivel naquela fase (so em AFTER INSERT),
-- entao a FK violation abortava a transacao inteira e o contato nunca era
-- criado. Orgs com round_robin_enabled=true perdiam 100% dos leads novos via
-- webhook do WhatsApp (sintoma: 19 leads perdidos na Central Trabalhista em
-- 20/04/2026).
--
-- Orgs com round_robin_enabled=false nao caiam neste path (trigger retornava
-- cedo) por isso Viagi nao foi afetada.
--
-- Fix:
--   - BEFORE INSERT continua responsavel por setar NEW.owner_user_id via
--     assign_round_robin(). Precisa estar em BEFORE pra modificar NEW.
--   - AFTER INSERT novo executa a auditoria (insert em activities) com o
--     contact.id ja comitavel.
--
-- Heuristica para nao auditar atribuicoes manuais explicitas (ex: admin
-- setando owner_user_id diretamente via API com JWT): so audita se
-- request.jwt.claims->>sub e null (requisicao service_role, sem user).
-- ============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- 1. Reescreve BEFORE INSERT trigger: so atribui owner, sem activity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_contacts_round_robin()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_assigned uuid;
  v_scope text;
BEGIN
  -- Se owner ja setado manualmente, respeitar
  IF NEW.owner_user_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT round_robin_scope INTO v_scope
  FROM organizations
  WHERE id = NEW.organization_id;

  IF v_scope NOT IN ('contacts_only', 'threads_and_contacts') THEN
    RETURN NEW;
  END IF;

  v_assigned := assign_round_robin(NEW.organization_id);

  IF v_assigned IS NOT NULL THEN
    NEW.owner_user_id := v_assigned;
  END IF;

  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 2. Cria AFTER INSERT trigger para audit activity
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_contacts_round_robin_audit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_caller_sub text;
BEGIN
  IF NEW.owner_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Captura JWT claim de forma cirurgica: so engole as exceptions
  -- esperadas (config nao setada ou payload nao-json em sessoes sem
  -- PostgREST). Outros erros (deadlock, timeout, etc) devem propagar.
  BEGIN
    v_caller_sub := current_setting('request.jwt.claims', true)::jsonb->>'sub';
  EXCEPTION
    WHEN invalid_text_representation OR undefined_object THEN
      v_caller_sub := NULL;
  END;

  -- Atribuicao manual via UI tem JWT user; nao loga aqui (tem audit trail proprio)
  IF v_caller_sub IS NOT NULL THEN
    RETURN NULL;
  END IF;

  INSERT INTO activities (
    organization_id,
    contact_id,
    activity_type,
    title,
    body,
    occurred_at
  )
  VALUES (
    NEW.organization_id,
    NEW.id,
    'note',
    'Atribuicao automatica',
    'Contato auto-atribuido via round-robin',
    now()
  );

  RETURN NULL;
END;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Cria o trigger AFTER (BEFORE mantem-se com mesmo nome via CREATE OR REPLACE)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS contacts_round_robin_audit ON public.contacts;

CREATE TRIGGER contacts_round_robin_audit
  AFTER INSERT ON public.contacts
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_contacts_round_robin_audit();

-- ---------------------------------------------------------------------------
-- 4. Comentarios para futura manutencao
-- ---------------------------------------------------------------------------
COMMENT ON FUNCTION public.trg_contacts_round_robin() IS
  'BEFORE INSERT: atribui owner_user_id via assign_round_robin(). Mantido em BEFORE pois precisa modificar NEW. NAO inserir em outras tabelas aqui - NEW.id ainda nao e comitavel. Side-effects em AFTER trigger contacts_round_robin_audit.';

COMMENT ON FUNCTION public.trg_contacts_round_robin_audit() IS
  'AFTER INSERT: cria activity de auditoria quando owner_user_id foi atribuido automaticamente via round-robin. Heuristica: so loga quando JWT claim sub e null (requisicoes service_role). Fix do FK violation historico (ver migration 20260421000000).';

COMMIT;
