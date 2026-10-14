CREATE TABLE public.user_widget_workspace (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  layout jsonb NOT NULL DEFAULT '{"version":1,"windows":{}}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_widget_workspace_uniq UNIQUE (organization_id, user_id),
  CONSTRAINT user_widget_workspace_size CHECK (pg_column_size(layout) <= 16384)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_widget_workspace TO authenticated;
GRANT ALL ON public.user_widget_workspace TO service_role;
REVOKE ALL ON public.user_widget_workspace FROM anon;
ALTER TABLE public.user_widget_workspace ENABLE ROW LEVEL SECURITY;
CREATE POLICY uww_own ON public.user_widget_workspace FOR ALL TO authenticated
  USING (user_id = public.current_user_id()
         AND organization_id = ANY (public.current_user_org_ids()))
  WITH CHECK (user_id = public.current_user_id()
              AND organization_id = ANY (public.current_user_org_ids()));
CREATE TRIGGER trg_user_widget_workspace_updated_at
  BEFORE UPDATE ON public.user_widget_workspace
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();