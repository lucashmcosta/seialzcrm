-- Add theme customization columns to organizations
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS theme_primary_color text DEFAULT '206 50% 29%',
ADD COLUMN IF NOT EXISTS theme_sidebar_color text DEFAULT '0 0% 98%',
ADD COLUMN IF NOT EXISTS theme_dark_mode boolean DEFAULT false;