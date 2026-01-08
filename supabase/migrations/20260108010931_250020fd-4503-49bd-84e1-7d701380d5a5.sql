-- Add logo_size column to organizations table
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_size integer DEFAULT 40;