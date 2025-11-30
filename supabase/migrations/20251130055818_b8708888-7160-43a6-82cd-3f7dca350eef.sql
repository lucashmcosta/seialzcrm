-- Criar tabela de planos
CREATE TABLE IF NOT EXISTS plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  display_name text NOT NULL,
  description text,
  price_monthly numeric DEFAULT 0,
  price_yearly numeric DEFAULT 0,
  max_seats integer,
  max_contacts integer,
  max_storage_mb integer DEFAULT 500,
  features jsonb DEFAULT '[]'::jsonb,
  is_active boolean DEFAULT true,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Inserir planos padrão
INSERT INTO plans (name, display_name, description, price_monthly, price_yearly, max_seats, max_contacts, sort_order) VALUES
('free', 'Free', 'Para começar', 0, 0, 3, 100, 1),
('starter', 'Starter', 'Para pequenas equipes', 49, 470, 10, 1000, 2),
('pro', 'Pro', 'Para equipes em crescimento', 149, 1430, 50, 10000, 3),
('enterprise', 'Enterprise', 'Para grandes empresas', 499, 4790, 999, 100000, 4);

-- RLS para planos
ALTER TABLE plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view active plans" ON plans FOR SELECT USING (is_active = true);
CREATE POLICY "Admins can manage plans" ON plans FOR ALL USING (is_admin_user());

-- Trigger para updated_at em plans
CREATE TRIGGER update_plans_updated_at BEFORE UPDATE ON plans
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Adicionar campos de grandfathering e trial à tabela subscriptions
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS plan_id uuid REFERENCES plans(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS locked_price_monthly numeric;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS locked_price_yearly numeric;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS price_locked_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_extended_by_admin_id uuid REFERENCES admin_users(id);
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS trial_extension_reason text;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS original_trial_days integer DEFAULT 14;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS extended_trial_days integer DEFAULT 0;

-- Criar tabela de cupons
CREATE TABLE IF NOT EXISTS coupons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  description text,
  discount_type text NOT NULL CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value numeric NOT NULL,
  max_uses integer,
  current_uses integer DEFAULT 0,
  valid_from timestamptz DEFAULT now(),
  valid_until timestamptz,
  applicable_plans uuid[],
  is_active boolean DEFAULT true,
  created_by_admin_id uuid REFERENCES admin_users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS para cupons
ALTER TABLE coupons ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage coupons" ON coupons FOR ALL USING (is_admin_user());

-- Trigger para updated_at em coupons
CREATE TRIGGER update_coupons_updated_at BEFORE UPDATE ON coupons
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Criar tabela de resgates de cupons
CREATE TABLE IF NOT EXISTS coupon_redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id uuid NOT NULL REFERENCES coupons(id),
  subscription_id uuid NOT NULL REFERENCES subscriptions(id),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  redeemed_at timestamptz DEFAULT now(),
  discount_applied numeric NOT NULL,
  redeemed_by_admin_id uuid REFERENCES admin_users(id)
);

-- RLS para resgates
ALTER TABLE coupon_redemptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view redemptions" ON coupon_redemptions FOR SELECT USING (is_admin_user());
CREATE POLICY "Admins can insert redemptions" ON coupon_redemptions FOR INSERT WITH CHECK (is_admin_user());