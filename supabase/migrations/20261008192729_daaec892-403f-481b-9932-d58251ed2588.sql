-- 1) organization_widgets
CREATE TABLE public.organization_widgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  widget_key text NOT NULL CHECK (widget_key ~ '^[a-z][a-z0-9_]{1,63}$'),
  is_enabled boolean NOT NULL DEFAULT false,
  updated_by_user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_widgets_org_key_uniq UNIQUE (organization_id, widget_key)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_widgets TO authenticated;
GRANT ALL ON public.organization_widgets TO service_role;
ALTER TABLE public.organization_widgets ENABLE ROW LEVEL SECURITY;
CREATE POLICY ow_select ON public.organization_widgets FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));
CREATE POLICY ow_insert ON public.organization_widgets FOR INSERT TO authenticated
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE POLICY ow_update ON public.organization_widgets FOR UPDATE TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'))
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE POLICY ow_delete ON public.organization_widgets FOR DELETE TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'));

CREATE OR REPLACE FUNCTION public.fn_organization_widgets_stamp()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.updated_by_user_id := public.current_user_id();
  ELSIF TG_OP = 'UPDATE' THEN
    NEW.updated_by_user_id := OLD.updated_by_user_id;
  ELSE
    NEW.updated_by_user_id := NULL;
  END IF;
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN NEW.created_at := OLD.created_at; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.fn_organization_widgets_stamp() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER trg_organization_widgets_stamp
  BEFORE INSERT OR UPDATE ON public.organization_widgets
  FOR EACH ROW EXECUTE FUNCTION public.fn_organization_widgets_stamp();

-- 2) organization_widget_screens
CREATE TABLE public.organization_widget_screens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  widget_key text NOT NULL,
  screen text NOT NULL CHECK (screen IN ('commercial','inbox','opportunities','contacts')),
  is_enabled boolean NOT NULL DEFAULT false,
  open_mode text NOT NULL DEFAULT 'drawer' CHECK (open_mode IN ('modal','drawer')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT organization_widget_screens_uniq UNIQUE (organization_id, widget_key, screen),
  CONSTRAINT organization_widget_screens_widget_fk
    FOREIGN KEY (organization_id, widget_key)
    REFERENCES public.organization_widgets (organization_id, widget_key)
    ON DELETE CASCADE
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_widget_screens TO authenticated;
GRANT ALL ON public.organization_widget_screens TO service_role;
ALTER TABLE public.organization_widget_screens ENABLE ROW LEVEL SECURITY;
CREATE POLICY ows_select ON public.organization_widget_screens FOR SELECT TO authenticated
  USING (organization_id = ANY (public.current_user_org_ids()));
CREATE POLICY ows_insert ON public.organization_widget_screens FOR INSERT TO authenticated
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE POLICY ows_update ON public.organization_widget_screens FOR UPDATE TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'))
  WITH CHECK (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE POLICY ows_delete ON public.organization_widget_screens FOR DELETE TO authenticated
  USING (public.user_has_org_permission(organization_id, 'can_manage_settings'));
CREATE TRIGGER trg_organization_widget_screens_updated_at
  BEFORE UPDATE ON public.organization_widget_screens
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) user_widget_preferences
CREATE TABLE public.user_widget_preferences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  screen text NOT NULL CHECK (screen IN ('commercial','inbox','opportunities','contacts')),
  pinned_widget_keys text[] NOT NULL DEFAULT '{}'
    CHECK (cardinality(pinned_widget_keys) <= 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_widget_preferences_uniq UNIQUE (organization_id, user_id, screen)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_widget_preferences TO authenticated;
GRANT ALL ON public.user_widget_preferences TO service_role;
ALTER TABLE public.user_widget_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY uwp_own ON public.user_widget_preferences FOR ALL TO authenticated
  USING (user_id = public.current_user_id()
         AND organization_id = ANY (public.current_user_org_ids()))
  WITH CHECK (user_id = public.current_user_id()
              AND organization_id = ANY (public.current_user_org_ids()));
CREATE TRIGGER trg_user_widget_preferences_updated_at
  BEFORE UPDATE ON public.user_widget_preferences
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4) Realtime
ALTER PUBLICATION supabase_realtime
  ADD TABLE public.organization_widgets, public.organization_widget_screens;