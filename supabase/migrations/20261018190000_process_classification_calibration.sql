-- Classificação de processos — Fase 4: calibração com versões (rascunho, publicar, restaurar).
-- Spec: docs/classificacao-v1/SPEC.md §8.2. Rollback: supabase/rollback/20261018190000_process_classification_calibration_DOWN.sql
-- Tudo que calcula (conferir, comparar, simular, impacto) roda na edge process-classification-admin com o motor.
-- Aqui: gravação atômica do rascunho (1 por org, com controle de concorrência) e publicação transacional.
-- Só service_role: a edge confere as permissões (calibrar / publicar) antes de chamar.

-- Salva o rascunho. _expected_updated_at = a versão que o admin abriu; se outra pessoa salvou depois, recusa
-- (pc:draft_conflict) em vez de sobrescrever em silêncio. NULL = criar (falha se já existir um rascunho).
CREATE OR REPLACE FUNCTION public.pc_save_draft(_org uuid, _content jsonb, _actor uuid, _expected_updated_at timestamptz, _motor_version text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record; v_pub uuid; v_next integer;
BEGIN
  SELECT * INTO d FROM public.classification_calibration_versions WHERE organization_id = _org AND status = 'draft' FOR UPDATE;
  IF FOUND THEN
    IF _expected_updated_at IS NULL OR d.updated_at <> _expected_updated_at THEN RAISE EXCEPTION 'pc:draft_conflict'; END IF;
    UPDATE public.classification_calibration_versions SET content = _content, motor_version = _motor_version
     WHERE id = d.id RETURNING * INTO d;
  ELSE
    IF _expected_updated_at IS NOT NULL THEN RAISE EXCEPTION 'pc:draft_conflict'; END IF;  -- foi publicado/descartado por outra pessoa
    PERFORM pg_advisory_xact_lock(hashtext('pc_calibration:' || _org::text));
    SELECT id INTO v_pub FROM public.classification_calibration_versions WHERE organization_id = _org AND status = 'published';
    SELECT COALESCE(max(number), 0) + 1 INTO v_next FROM public.classification_calibration_versions WHERE organization_id = _org;
    INSERT INTO public.classification_calibration_versions(organization_id, number, status, content, motor_version, based_on_id, created_by)
    VALUES (_org, v_next, 'draft', _content, _motor_version, v_pub, _actor) RETURNING * INTO d;
  END IF;
  RETURN jsonb_build_object('id', d.id, 'number', d.number, 'updatedAt', d.updated_at);
END $$;

CREATE OR REPLACE FUNCTION public.pc_discard_draft(_org uuid)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.classification_calibration_versions WHERE organization_id = _org AND status = 'draft' RETURNING 1)
  SELECT EXISTS (SELECT 1 FROM d)
$$;

-- Publica o rascunho: arquiva a publicada e publica o rascunho na mesma transação. Nota obrigatória.
-- _expected_updated_at garante que é o mesmo rascunho que o admin conferiu (conferência e diff feitos na edge).
CREATE OR REPLACE FUNCTION public.pc_publish_calibration(_org uuid, _actor uuid, _note text, _expected_updated_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE d record;
BEGIN
  IF length(btrim(COALESCE(_note, ''))) = 0 THEN RAISE EXCEPTION 'pc:note_required'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('pc_calibration:' || _org::text));
  SELECT * INTO d FROM public.classification_calibration_versions WHERE organization_id = _org AND status = 'draft' FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'pc:no_draft'; END IF;
  IF d.updated_at <> _expected_updated_at THEN RAISE EXCEPTION 'pc:draft_conflict'; END IF;
  UPDATE public.classification_calibration_versions SET status = 'archived' WHERE organization_id = _org AND status = 'published';
  UPDATE public.classification_calibration_versions
     SET status = 'published', note = btrim(_note), published_by = _actor, published_at = now()
   WHERE id = d.id;
  RETURN jsonb_build_object('id', d.id, 'number', d.number);
END $$;

DO $$ DECLARE f text; BEGIN
  FOREACH f IN ARRAY ARRAY['pc_save_draft(uuid, jsonb, uuid, timestamptz, text)', 'pc_discard_draft(uuid)', 'pc_publish_calibration(uuid, uuid, text, timestamptz)'] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO service_role', f);
  END LOOP;
END $$;
