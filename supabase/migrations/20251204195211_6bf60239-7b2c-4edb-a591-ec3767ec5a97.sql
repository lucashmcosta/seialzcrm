-- Add inbound_settings column to organization_phone_numbers
ALTER TABLE organization_phone_numbers 
ADD COLUMN IF NOT EXISTS inbound_settings jsonb DEFAULT '{"auto_create_contact": true, "default_lifecycle_stage": "lead"}'::jsonb;

-- Make contact_id nullable in calls table
ALTER TABLE calls ALTER COLUMN contact_id DROP NOT NULL;