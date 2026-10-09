-- Rollback A1 — restaura o estado exposto anterior (NÃO recomendado).
ALTER TABLE public._document_submissions_backup_phase1 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_ct_inbox_cleanup_2026_07 DISABLE ROW LEVEL SECURITY;
ALTER TABLE public._documents_e1_backup DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public._document_submissions_backup_phase1, public._backup_ct_inbox_cleanup_2026_07, public._documents_e1_backup TO anon, authenticated;
