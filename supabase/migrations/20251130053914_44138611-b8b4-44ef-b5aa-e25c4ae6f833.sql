-- Create impersonation_sessions table for tracking admin impersonations
CREATE TABLE public.impersonation_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id UUID REFERENCES admin_users(id) ON DELETE CASCADE,
  target_user_id UUID NOT NULL,
  target_user_email TEXT NOT NULL,
  target_user_name TEXT,
  organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ DEFAULT now() NOT NULL,
  ended_at TIMESTAMPTZ,
  duration_seconds INTEGER,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'ended')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_impersonation_sessions_admin ON impersonation_sessions(admin_user_id);
CREATE INDEX idx_impersonation_sessions_status ON impersonation_sessions(status);
CREATE INDEX idx_impersonation_sessions_started ON impersonation_sessions(started_at DESC);

-- Enable RLS
ALTER TABLE public.impersonation_sessions ENABLE ROW LEVEL SECURITY;

-- Policy: Only admins can view impersonation sessions
CREATE POLICY "Admins can view impersonation sessions"
ON public.impersonation_sessions
FOR SELECT
TO authenticated
USING (is_admin_user());

-- Policy: Only admins can insert impersonation sessions (via edge function)
CREATE POLICY "Admins can insert impersonation sessions"
ON public.impersonation_sessions
FOR INSERT
TO authenticated
WITH CHECK (is_admin_user());

-- Policy: Only admins can update impersonation sessions (to end them)
CREATE POLICY "Admins can update impersonation sessions"
ON public.impersonation_sessions
FOR UPDATE
TO authenticated
USING (is_admin_user());