
-- =========================================================
-- document_types
-- =========================================================
CREATE TABLE public.document_types (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code            text NOT NULL,
  name            text NOT NULL,
  is_required     boolean NOT NULL DEFAULT true,
  sort_order      int NOT NULL DEFAULT 0,
  is_active       boolean NOT NULL DEFAULT true,
  created_by      uuid NULL,
  updated_by      uuid NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  deleted_at      timestamptz NULL,
  CONSTRAINT document_types_name_len CHECK (char_length(name) BETWEEN 1 AND 120),
  CONSTRAINT document_types_code_len CHECK (char_length(code) BETWEEN 1 AND 60)
);

CREATE UNIQUE INDEX document_types_org_code_unique
  ON public.document_types (organization_id, code)
  WHERE deleted_at IS NULL;

CREATE INDEX document_types_org_active_sort_idx
  ON public.document_types (organization_id, is_active, sort_order)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_types TO authenticated;
GRANT ALL ON public.document_types TO service_role;

ALTER TABLE public.document_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_types select org members"
  ON public.document_types FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

CREATE POLICY "document_types insert org admins"
  ON public.document_types FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = ANY (current_user_org_ids())
    AND is_org_admin(organization_id)
  );

CREATE POLICY "document_types update org admins"
  ON public.document_types FOR UPDATE TO authenticated
  USING (organization_id = ANY (current_user_org_ids()) AND is_org_admin(organization_id))
  WITH CHECK (organization_id = ANY (current_user_org_ids()) AND is_org_admin(organization_id));

CREATE POLICY "document_types delete org admins"
  ON public.document_types FOR DELETE TO authenticated
  USING (organization_id = ANY (current_user_org_ids()) AND is_org_admin(organization_id));

CREATE TRIGGER document_types_set_updated_at
  BEFORE UPDATE ON public.document_types
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =========================================================
-- Helper: pode revisar documentos do contato?
-- =========================================================
CREATE OR REPLACE FUNCTION public.can_review_contact_documents(_contact_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contacts c
    WHERE c.id = _contact_id
      AND c.organization_id = ANY (current_user_org_ids())
      AND (
        is_org_admin(c.organization_id)
        OR c.owner_user_id = current_user_id()
        OR EXISTS (
          SELECT 1 FROM public.opportunities o
          WHERE o.contact_id = c.id
            AND o.owner_user_id = current_user_id()
            AND o.deleted_at IS NULL
        )
      )
  );
$$;


-- =========================================================
-- document_submissions
-- =========================================================
CREATE TABLE public.document_submissions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id          uuid NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  document_type_id    uuid NOT NULL REFERENCES public.document_types(id) ON DELETE RESTRICT,
  attachment_id       uuid NOT NULL REFERENCES public.attachments(id),
  status              text NOT NULL DEFAULT 'uploaded'
                      CHECK (status IN ('uploaded','approved','rejected')),
  uploaded_by_user_id uuid NOT NULL,
  uploaded_at         timestamptz NOT NULL DEFAULT now(),
  reviewed_by_user_id uuid NULL,
  reviewed_at         timestamptz NULL,
  rejection_reason    text NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  deleted_at          timestamptz NULL,
  CONSTRAINT document_submissions_rejection_len
    CHECK (rejection_reason IS NULL OR char_length(rejection_reason) <= 1000)
);

CREATE UNIQUE INDEX document_submissions_contact_type_unique
  ON public.document_submissions (contact_id, document_type_id)
  WHERE deleted_at IS NULL;

CREATE INDEX document_submissions_org_contact_idx
  ON public.document_submissions (organization_id, contact_id)
  WHERE deleted_at IS NULL;

CREATE INDEX document_submissions_org_status_idx
  ON public.document_submissions (organization_id, status)
  WHERE deleted_at IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_submissions TO authenticated;
GRANT ALL ON public.document_submissions TO service_role;

ALTER TABLE public.document_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_submissions select org members"
  ON public.document_submissions FOR SELECT TO authenticated
  USING (organization_id = ANY (current_user_org_ids()));

-- INSERT: usuário da org, com type e attachment válidos
CREATE POLICY "document_submissions insert org members"
  ON public.document_submissions FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = ANY (current_user_org_ids())
    AND uploaded_by_user_id = current_user_id()
    AND EXISTS (
      SELECT 1 FROM public.contacts c
      WHERE c.id = contact_id
        AND c.organization_id = document_submissions.organization_id
    )
    AND EXISTS (
      SELECT 1 FROM public.document_types dt
      WHERE dt.id = document_type_id
        AND dt.organization_id = document_submissions.organization_id
        AND dt.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.id = attachment_id
        AND a.organization_id = document_submissions.organization_id
        AND a.entity_type = 'contact_document'
        AND a.entity_id = document_submissions.contact_id
        AND a.deleted_at IS NULL
    )
  );

-- UPDATE: revisor; mantém integridade do type e attachment
CREATE POLICY "document_submissions update reviewers"
  ON public.document_submissions FOR UPDATE TO authenticated
  USING (
    organization_id = ANY (current_user_org_ids())
    AND can_review_contact_documents(contact_id)
  )
  WITH CHECK (
    organization_id = ANY (current_user_org_ids())
    AND can_review_contact_documents(contact_id)
    AND EXISTS (
      SELECT 1 FROM public.document_types dt
      WHERE dt.id = document_type_id
        AND dt.organization_id = document_submissions.organization_id
        AND dt.deleted_at IS NULL
    )
    AND EXISTS (
      SELECT 1 FROM public.attachments a
      WHERE a.id = attachment_id
        AND a.organization_id = document_submissions.organization_id
        AND a.entity_type = 'contact_document'
        AND a.entity_id = document_submissions.contact_id
        AND a.deleted_at IS NULL
    )
  );

CREATE POLICY "document_submissions delete reviewers"
  ON public.document_submissions FOR DELETE TO authenticated
  USING (
    organization_id = ANY (current_user_org_ids())
    AND can_review_contact_documents(contact_id)
  );

CREATE TRIGGER document_submissions_set_updated_at
  BEFORE UPDATE ON public.document_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- =========================================================
-- Realtime
-- =========================================================
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_types;
ALTER PUBLICATION supabase_realtime ADD TABLE public.document_submissions;
