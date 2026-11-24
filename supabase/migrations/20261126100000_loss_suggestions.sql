-- Sugestão de motivo de perda pela IA.
-- A função suggest-loss-reason lê a conversa, escolhe um motivo/detalhe do cadastro da org e grava aqui.
-- Quando a perda é gravada, o trigger liga a sugestão à perda e marca se a pessoa ficou com ela:
-- é com isso que medimos o acerto antes de deixar a IA perder sozinha.
-- Org escolhe em opportunity_loss_settings.ai_suggest (padrão: ligado; sem chave de IA nada acontece).
-- Rollback: DROP TRIGGER trg_link_loss_suggestion ON opportunity_losses; DROP FUNCTION fn_link_loss_suggestion_v1();
--           DROP TABLE opportunity_loss_suggestions; ALTER TABLE opportunity_loss_settings DROP COLUMN ai_suggest;
BEGIN;

ALTER TABLE public.opportunity_loss_settings ADD COLUMN IF NOT EXISTS ai_suggest boolean NOT NULL DEFAULT true;

CREATE TABLE IF NOT EXISTS public.opportunity_loss_suggestions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  opportunity_id uuid NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
  reason_id uuid REFERENCES public.opportunity_loss_reasons(id) ON DELETE SET NULL,
  detail_id uuid REFERENCES public.opportunity_loss_reason_details(id) ON DELETE SET NULL,
  confidence numeric(3,2) CHECK (confidence IS NULL OR confidence BETWEEN 0 AND 1),
  evidence text CHECK (evidence IS NULL OR length(evidence) <= 500),
  model text,
  messages_read integer NOT NULL DEFAULT 0,
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- preenchidos quando a perda é gravada
  loss_id uuid REFERENCES public.opportunity_losses(id) ON DELETE SET NULL,
  matched_reason boolean,
  matched_detail boolean
);
CREATE INDEX IF NOT EXISTS opportunity_loss_suggestions_opp_idx ON public.opportunity_loss_suggestions (opportunity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS opportunity_loss_suggestions_org_idx ON public.opportunity_loss_suggestions (organization_id, created_at DESC);

ALTER TABLE public.opportunity_loss_suggestions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_loss_suggestions_select ON public.opportunity_loss_suggestions;
CREATE POLICY opportunity_loss_suggestions_select ON public.opportunity_loss_suggestions
  FOR SELECT TO authenticated USING (organization_id = ANY(public.current_user_org_ids()));
REVOKE ALL ON public.opportunity_loss_suggestions FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.opportunity_loss_suggestions TO authenticated;
GRANT ALL ON public.opportunity_loss_suggestions TO service_role;

-- Liga a sugestão mais recente (últimas 48h, ainda sem perda) à perda gravada.
CREATE OR REPLACE FUNCTION public.fn_link_loss_suggestion_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.opportunity_loss_suggestions s
  SET loss_id = NEW.id,
      matched_reason = (s.reason_id IS NOT DISTINCT FROM NEW.reason_id),
      matched_detail = CASE WHEN s.detail_id IS NULL AND NEW.detail_id IS NULL THEN NULL
                            ELSE s.detail_id IS NOT DISTINCT FROM NEW.detail_id END
  WHERE s.id = (
    SELECT id FROM public.opportunity_loss_suggestions
    WHERE opportunity_id = NEW.opportunity_id AND loss_id IS NULL AND created_at > now() - interval '48 hours'
    ORDER BY created_at DESC LIMIT 1);
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_link_loss_suggestion_v1() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_link_loss_suggestion ON public.opportunity_losses;
CREATE TRIGGER trg_link_loss_suggestion AFTER INSERT ON public.opportunity_losses
FOR EACH ROW EXECUTE FUNCTION public.fn_link_loss_suggestion_v1();

-- Acerto da IA por org (tela de motivos): sugestões com motivo e se a perda gravada ficou com ele.
CREATE OR REPLACE FUNCTION public.loss_suggestion_stats_v1(_organization_id uuid, _days integer DEFAULT 90)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.role() <> 'service_role' AND NOT (_organization_id = ANY(public.current_user_org_ids())) THEN
    RAISE EXCEPTION 'forbidden_organization' USING ERRCODE = '42501';
  END IF;
  RETURN (
    SELECT jsonb_build_object(
      'suggested', count(*),
      'decided', count(*) FILTER (WHERE s.loss_id IS NOT NULL),
      'reason_hits', count(*) FILTER (WHERE s.matched_reason),
      'detail_hits', count(*) FILTER (WHERE s.matched_detail))
    FROM public.opportunity_loss_suggestions s
    WHERE s.organization_id = _organization_id AND s.reason_id IS NOT NULL
      AND s.created_at > now() - make_interval(days => greatest(1, least(coalesce(_days, 90), 365))));
END $$;
REVOKE ALL ON FUNCTION public.loss_suggestion_stats_v1(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.loss_suggestion_stats_v1(uuid, integer) TO authenticated, service_role;

INSERT INTO supabase_migrations.schema_migrations(version, name)
VALUES ('20261126100000', 'loss_suggestions') ON CONFLICT DO NOTHING;
COMMIT;

SELECT pg_notify('pgrst', 'reload schema');
