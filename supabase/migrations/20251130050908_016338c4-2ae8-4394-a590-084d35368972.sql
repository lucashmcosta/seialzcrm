-- Add suspension fields to organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS suspended_at timestamptz DEFAULT NULL,
ADD COLUMN IF NOT EXISTS suspended_reason text DEFAULT NULL,
ADD COLUMN IF NOT EXISTS suspended_by_admin_id uuid REFERENCES admin_users(id);

-- Create admin_notifications table
CREATE TABLE IF NOT EXISTS admin_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_user_id uuid REFERENCES admin_users(id) ON DELETE CASCADE,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  read_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Create feature_flags table
CREATE TABLE IF NOT EXISTS feature_flags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_enabled boolean DEFAULT false,
  organization_ids uuid[] DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS on new tables
ALTER TABLE admin_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- RLS policies for admin_notifications
CREATE POLICY "Admins can view own notifications"
ON admin_notifications FOR SELECT
TO authenticated
USING (admin_user_id IN (
  SELECT id FROM admin_users WHERE auth_user_id = auth.uid()
));

CREATE POLICY "Admins can update own notifications"
ON admin_notifications FOR UPDATE
TO authenticated
USING (admin_user_id IN (
  SELECT id FROM admin_users WHERE auth_user_id = auth.uid()
));

-- RLS policies for feature_flags
CREATE POLICY "Admins can view feature flags"
ON feature_flags FOR SELECT
TO authenticated
USING (is_admin_user());

CREATE POLICY "Admins can manage feature flags"
ON feature_flags FOR ALL
TO authenticated
USING (is_admin_user());

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_admin_notifications_admin_user_id ON admin_notifications(admin_user_id);
CREATE INDEX IF NOT EXISTS idx_admin_notifications_read_at ON admin_notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_feature_flags_name ON feature_flags(name);
CREATE INDEX IF NOT EXISTS idx_organizations_suspended_at ON organizations(suspended_at);