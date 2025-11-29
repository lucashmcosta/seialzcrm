-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Create enum types
CREATE TYPE app_role AS ENUM ('admin', 'sales_rep', 'viewer');
CREATE TYPE subscription_status AS ENUM ('active', 'trialing', 'past_due', 'canceled');
CREATE TYPE onboarding_step AS ENUM ('invites', 'first_contact', 'first_opportunity', 'completed');
CREATE TYPE pipeline_stage_type AS ENUM ('custom', 'won', 'lost');
CREATE TYPE lifecycle_stage AS ENUM ('lead', 'customer', 'inactive');
CREATE TYPE opportunity_status AS ENUM ('open', 'won', 'lost');
CREATE TYPE activity_type AS ENUM ('note', 'message', 'call', 'task', 'status_change', 'pipeline_stage_change', 'system');
CREATE TYPE task_status AS ENUM ('open', 'completed', 'canceled');
CREATE TYPE task_priority AS ENUM ('low', 'medium', 'high');
CREATE TYPE duplicate_check_mode AS ENUM ('none', 'email', 'phone', 'email_or_phone');

-- Organizations (tenants)
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo_url TEXT,
  default_currency TEXT DEFAULT 'BRL',
  default_locale TEXT DEFAULT 'pt-BR',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  enable_companies_module BOOLEAN DEFAULT false,
  onboarding_step onboarding_step DEFAULT 'invites',
  onboarding_completed_at TIMESTAMPTZ,
  duplicate_check_mode duplicate_check_mode DEFAULT 'email',
  duplicate_enforce_block BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Users
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  locale TEXT DEFAULT 'pt-BR',
  timezone TEXT DEFAULT 'America/Sao_Paulo',
  is_platform_admin BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Permission profiles
CREATE TABLE permission_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  permissions JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- User organizations (memberships)
CREATE TABLE user_organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE NOT NULL,
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  permission_profile_id UUID REFERENCES permission_profiles(id) NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, organization_id)
);

-- Subscriptions (seat-based billing)
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE UNIQUE NOT NULL,
  plan_name TEXT DEFAULT 'free',
  status subscription_status DEFAULT 'active',
  billing_period TEXT DEFAULT 'monthly',
  current_period_start TIMESTAMPTZ DEFAULT now(),
  current_period_end TIMESTAMPTZ,
  max_seats INTEGER DEFAULT 3,
  price_per_seat DECIMAL(10,2) DEFAULT 0,
  is_free_plan BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Pipeline stages
CREATE TABLE pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  order_index INTEGER NOT NULL,
  type pipeline_stage_type DEFAULT 'custom',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- Contacts
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  full_name TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  email TEXT,
  phone TEXT,
  company_name TEXT,
  owner_user_id UUID REFERENCES users(id),
  lifecycle_stage lifecycle_stage DEFAULT 'lead',
  do_not_contact BOOLEAN DEFAULT false,
  is_sample BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Opportunities
CREATE TABLE opportunities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  title TEXT NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE SET NULL,
  amount DECIMAL(15,2) DEFAULT 0,
  currency TEXT DEFAULT 'BRL',
  pipeline_stage_id UUID REFERENCES pipeline_stages(id) NOT NULL,
  status opportunity_status DEFAULT 'open',
  close_date DATE,
  owner_user_id UUID REFERENCES users(id),
  is_sample BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Activities (unified timeline)
CREATE TABLE activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  activity_type activity_type NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  occurred_at TIMESTAMPTZ DEFAULT now(),
  created_by_user_id UUID REFERENCES users(id),
  is_sample BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Tasks
CREATE TABLE tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
  contact_id UUID REFERENCES contacts(id) ON DELETE CASCADE,
  opportunity_id UUID REFERENCES opportunities(id) ON DELETE CASCADE,
  assigned_user_id UUID REFERENCES users(id) NOT NULL,
  task_type TEXT DEFAULT 'general',
  title TEXT NOT NULL,
  description TEXT,
  status task_status DEFAULT 'open',
  due_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  priority task_priority DEFAULT 'medium',
  created_by_user_id UUID REFERENCES users(id),
  is_sample BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Create indexes
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX idx_user_organizations_user_id ON user_organizations(user_id);
CREATE INDEX idx_user_organizations_org_id ON user_organizations(organization_id);
CREATE INDEX idx_contacts_org_id ON contacts(organization_id);
CREATE INDEX idx_contacts_owner ON contacts(owner_user_id);
CREATE INDEX idx_contacts_email ON contacts(email);
CREATE INDEX idx_contacts_deleted_at ON contacts(organization_id, deleted_at);
CREATE INDEX idx_opportunities_org_id ON opportunities(organization_id);
CREATE INDEX idx_opportunities_contact ON opportunities(contact_id);
CREATE INDEX idx_opportunities_stage ON opportunities(pipeline_stage_id);
CREATE INDEX idx_opportunities_owner ON opportunities(owner_user_id);
CREATE INDEX idx_opportunities_deleted_at ON opportunities(organization_id, deleted_at);
CREATE INDEX idx_activities_org_id ON activities(organization_id);
CREATE INDEX idx_activities_contact ON activities(contact_id);
CREATE INDEX idx_activities_opportunity ON activities(opportunity_id);
CREATE INDEX idx_tasks_org_id ON tasks(organization_id);
CREATE INDEX idx_tasks_assigned_user ON tasks(assigned_user_id);
CREATE INDEX idx_tasks_due_at ON tasks(due_at);

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE permission_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipeline_stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Helper function to check if user belongs to organization
CREATE OR REPLACE FUNCTION user_has_org_access(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM user_organizations uo
    INNER JOIN users u ON u.id = uo.user_id
    WHERE uo.organization_id = org_id
    AND u.auth_user_id = auth.uid()
    AND uo.is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RLS Policies for users table
CREATE POLICY "Users can view their own record"
  ON users FOR SELECT
  USING (auth_user_id = auth.uid());

CREATE POLICY "Users can update their own record"
  ON users FOR UPDATE
  USING (auth_user_id = auth.uid());

-- RLS Policies for organizations
CREATE POLICY "Users can view their organizations"
  ON organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM user_organizations uo
      INNER JOIN users u ON u.id = uo.user_id
      WHERE uo.organization_id = organizations.id
      AND u.auth_user_id = auth.uid()
      AND uo.is_active = true
    )
  );

CREATE POLICY "Users can update their organizations"
  ON organizations FOR UPDATE
  USING (user_has_org_access(id));

-- RLS Policies for user_organizations
CREATE POLICY "Users can view their organization memberships"
  ON user_organizations FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM users
      WHERE users.id = user_organizations.user_id
      AND users.auth_user_id = auth.uid()
    )
    OR user_has_org_access(organization_id)
  );

-- RLS Policies for permission_profiles
CREATE POLICY "Users can view permission profiles in their org"
  ON permission_profiles FOR SELECT
  USING (user_has_org_access(organization_id));

-- RLS Policies for subscriptions
CREATE POLICY "Users can view their org's subscription"
  ON subscriptions FOR SELECT
  USING (user_has_org_access(organization_id));

-- RLS Policies for pipeline_stages
CREATE POLICY "Users can view pipeline stages in their org"
  ON pipeline_stages FOR SELECT
  USING (user_has_org_access(organization_id));

CREATE POLICY "Users can manage pipeline stages in their org"
  ON pipeline_stages FOR ALL
  USING (user_has_org_access(organization_id));

-- RLS Policies for contacts
CREATE POLICY "Users can view contacts in their org"
  ON contacts FOR SELECT
  USING (user_has_org_access(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert contacts in their org"
  ON contacts FOR INSERT
  WITH CHECK (user_has_org_access(organization_id));

CREATE POLICY "Users can update contacts in their org"
  ON contacts FOR UPDATE
  USING (user_has_org_access(organization_id));

CREATE POLICY "Users can delete contacts in their org"
  ON contacts FOR DELETE
  USING (user_has_org_access(organization_id));

-- RLS Policies for opportunities
CREATE POLICY "Users can view opportunities in their org"
  ON opportunities FOR SELECT
  USING (user_has_org_access(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert opportunities in their org"
  ON opportunities FOR INSERT
  WITH CHECK (user_has_org_access(organization_id));

CREATE POLICY "Users can update opportunities in their org"
  ON opportunities FOR UPDATE
  USING (user_has_org_access(organization_id));

CREATE POLICY "Users can delete opportunities in their org"
  ON opportunities FOR DELETE
  USING (user_has_org_access(organization_id));

-- RLS Policies for activities
CREATE POLICY "Users can view activities in their org"
  ON activities FOR SELECT
  USING (user_has_org_access(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can insert activities in their org"
  ON activities FOR INSERT
  WITH CHECK (user_has_org_access(organization_id));

-- RLS Policies for tasks
CREATE POLICY "Users can view tasks in their org"
  ON tasks FOR SELECT
  USING (user_has_org_access(organization_id) AND deleted_at IS NULL);

CREATE POLICY "Users can manage tasks in their org"
  ON tasks FOR ALL
  USING (user_has_org_access(organization_id));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_permission_profiles_updated_at BEFORE UPDATE ON permission_profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_organizations_updated_at BEFORE UPDATE ON user_organizations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_pipeline_stages_updated_at BEFORE UPDATE ON pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_contacts_updated_at BEFORE UPDATE ON contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_opportunities_updated_at BEFORE UPDATE ON opportunities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();