
CREATE TABLE public.message_snippets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  title text NOT NULL,
  shortcut text NULL,
  body text NOT NULL,
  category text NULL,
  allowed_purposes text[] NOT NULL DEFAULT '{}',
  is_active boolean NOT NULL DEFAULT true,
  usage_count bigint NOT NULL DEFAULT 0,
  last_used_at timestamptz NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.message_snippets TO authenticated;
GRANT ALL ON public.message_snippets TO service_role;

ALTER TABLE public.message_snippets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org members can read snippets"
  ON public.message_snippets FOR SELECT
  TO authenticated
  USING (organization_id = ANY(current_user_org_ids()));

CREATE POLICY "org members can insert snippets"
  ON public.message_snippets FOR INSERT
  TO authenticated
  WITH CHECK (organization_id = ANY(current_user_org_ids()));

CREATE POLICY "org members can update snippets"
  ON public.message_snippets FOR UPDATE
  TO authenticated
  USING (organization_id = ANY(current_user_org_ids()))
  WITH CHECK (organization_id = ANY(current_user_org_ids()));

CREATE POLICY "org members can delete snippets"
  ON public.message_snippets FOR DELETE
  TO authenticated
  USING (organization_id = ANY(current_user_org_ids()));

CREATE INDEX idx_message_snippets_org_active
  ON public.message_snippets (organization_id, is_active);

CREATE INDEX idx_message_snippets_org_shortcut
  ON public.message_snippets (organization_id, shortcut)
  WHERE shortcut IS NOT NULL;

CREATE INDEX idx_message_snippets_allowed_purposes
  ON public.message_snippets USING GIN (allowed_purposes);

CREATE TRIGGER update_message_snippets_updated_at
  BEFORE UPDATE ON public.message_snippets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
