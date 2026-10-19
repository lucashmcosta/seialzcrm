-- Controle de reabertura: tirar uma oportunidade de Ganho ou Perdido.
-- Opt-in por org (opportunity_close_policies.control_reopen, padrão desligado: nenhuma org muda até ligar).
-- Ligado, só o Admin (perfil de sistema) e perfis com ferramentas.reabrir_oportunidade podem.
-- Rollback: supabase/rollback/20261019190000_opportunity_reopen_control_DOWN.sql
--
-- Vale para todos os caminhos (botão Reabrir, Kanban, lote, RPC de transição): o trigger olha o resultado final
-- da linha (AFTER, depois da sincronização status ← etapa). Usa auth.role() e não current_user porque a RPC de
-- transição é SECURITY DEFINER: dentro dela current_user é o dono da função, mas o JWT continua sendo do usuário.
-- service_role (edge functions, integrações) passa.

ALTER TABLE public.opportunity_close_policies
  ADD COLUMN IF NOT EXISTS control_reopen boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.fn_guard_opportunity_reopen_v1()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN RETURN NEW; END IF;
  IF NOT COALESCE((SELECT control_reopen FROM public.opportunity_close_policies WHERE organization_id = NEW.organization_id), false) THEN
    RETURN NEW;
  END IF;
  IF public.is_org_system_admin(NEW.organization_id)
     OR COALESCE((public.my_perms_v2(NEW.organization_id) #>> '{ferramentas,reabrir_oportunidade}')::boolean, false) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'reopen_forbidden' USING ERRCODE = '42501',
    HINT = 'Só quem tem a permissão "Reabrir oportunidade ganha ou perdida" pode tirar uma venda de Ganho ou Perdido.';
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_guard_opportunity_reopen_v1() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_opportunity_reopen_v1 ON public.opportunities;
CREATE TRIGGER trg_guard_opportunity_reopen_v1
AFTER UPDATE ON public.opportunities
FOR EACH ROW
WHEN (OLD.status::text IN ('won', 'lost') AND NEW.status IS DISTINCT FROM OLD.status)
EXECUTE FUNCTION public.fn_guard_opportunity_reopen_v1();

-- Admin de sistema recebe a chave nova (rbac_full_perms é a fonte do perfil Admin).
DO $$ DECLARE d text; n text; BEGIN
  d := pg_get_functiondef('public.rbac_full_perms()'::regprocedure);
  n := replace(d, '"certificar_classificacao":true}', '"certificar_classificacao":true,"reabrir_oportunidade":true}');
  IF n = d THEN RAISE EXCEPTION 'reopen: rbac_full_perms trecho não encontrado'; END IF;
  EXECUTE n;
END $$;
