-- Passagem do agente para a equipe já avisa o vendedor escolhido ("Lead passado pelo
-- agente", em fn_agent_release_thread). O aviso geral para todos da org duplicava isso.
-- Fora da passagem do agente, nada muda.
CREATE OR REPLACE FUNCTION public.handle_handoff_notification()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_contact_name text;
BEGIN
  -- Only fire when needs_human_attention changes from false/null to true
  IF NEW.needs_human_attention = true
     AND (OLD.needs_human_attention = false OR OLD.needs_human_attention IS NULL) THEN

    -- Passagem do agente: o vendedor já recebeu o aviso próprio.
    IF NEW.ai_agent_released_at IS NOT NULL AND OLD.ai_agent_released_at IS NULL THEN
      RETURN NEW;
    END IF;

    -- Get contact name
    SELECT full_name INTO v_contact_name
    FROM contacts WHERE id = NEW.contact_id;

    -- Batch insert notifications for ALL active org users (single INSERT)
    INSERT INTO notifications (organization_id, user_id, type, title, body, entity_type, entity_id)
    SELECT
      NEW.organization_id,
      uo.user_id,
      'handoff',
      'Conversa transferida para atendimento',
      'A conversa com ' || COALESCE(v_contact_name, 'contato') || ' precisa de atendimento humano',
      'message_thread',
      NEW.id
    FROM user_organizations uo
    WHERE uo.organization_id = NEW.organization_id
      AND uo.is_active = true;
  END IF;

  RETURN NEW;
END;
$function$;
