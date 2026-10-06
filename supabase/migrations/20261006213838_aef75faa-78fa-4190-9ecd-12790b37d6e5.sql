DROP POLICY IF EXISTS "System can insert notifications" ON public.notifications;
REVOKE INSERT ON public.notifications FROM anon;
REVOKE INSERT ON public.notifications FROM authenticated;