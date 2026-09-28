CREATE TABLE public.suvsign_v2_template_document_types (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id text NOT NULL,
  template_name text,
  document_type_id uuid NOT NULL REFERENCES public.document_types(id) ON DELETE CASCADE,
  created_by uuid REFERENCES public.users(id),
  updated_by uuid REFERENCES public.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, template_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suvsign_v2_template_document_types TO authenticated;
GRANT ALL ON public.suvsign_v2_template_document_types TO service_role;
ALTER TABLE public.suvsign_v2_template_document_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members read template doc types" ON public.suvsign_v2_template_document_types
  FOR SELECT TO authenticated USING (organization_id = ANY(public.current_user_org_ids()));
CREATE POLICY "Integration managers insert template doc types" ON public.suvsign_v2_template_document_types
  FOR INSERT TO authenticated WITH CHECK (public.can_manage_integrations_in_org(organization_id));
CREATE POLICY "Integration managers update template doc types" ON public.suvsign_v2_template_document_types
  FOR UPDATE TO authenticated USING (public.can_manage_integrations_in_org(organization_id)) WITH CHECK (public.can_manage_integrations_in_org(organization_id));
CREATE POLICY "Integration managers delete template doc types" ON public.suvsign_v2_template_document_types
  FOR DELETE TO authenticated USING (public.can_manage_integrations_in_org(organization_id));

CREATE OR REPLACE FUNCTION public.fn_guard_suvsign_v2_template_doc_type()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.document_types dt WHERE dt.id = NEW.document_type_id
      AND (dt.organization_id IS NULL OR dt.organization_id = NEW.organization_id) AND dt.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'document_type_not_in_org';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
CREATE TRIGGER trg_guard_suvsign_v2_template_doc_type BEFORE INSERT OR UPDATE ON public.suvsign_v2_template_document_types
  FOR EACH ROW EXECUTE FUNCTION public.fn_guard_suvsign_v2_template_doc_type();