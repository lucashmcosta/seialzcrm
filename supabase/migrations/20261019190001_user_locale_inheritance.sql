-- Existing preferences are retained. Inserts without an explicit locale inherit the org.
ALTER TABLE public.users ALTER COLUMN locale DROP DEFAULT;
