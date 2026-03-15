-- This is a data fix, not a schema change, but using migration tool as it's the only way to run UPDATE
-- Assign the first active org admin as owner for all Kommo contacts without owner
UPDATE contacts 
SET owner_user_id = 'cf411cdf-6009-46c2-aa77-f3e62d5d64d6' 
WHERE source = 'kommo' 
AND owner_user_id IS NULL 
AND organization_id = 'ddd271f1-a07f-4e68-9ae8-c861939354ae';