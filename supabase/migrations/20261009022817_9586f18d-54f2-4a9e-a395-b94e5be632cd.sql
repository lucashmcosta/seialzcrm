ALTER TABLE public._document_submissions_backup_phase1 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_ct_inbox_cleanup_2026_07 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._documents_e1_backup ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._document_submissions_backup_phase1, public._backup_ct_inbox_cleanup_2026_07, public._documents_e1_backup FROM anon, authenticated;