-- Clean orphan activities tied to kommo contacts
DELETE FROM activities WHERE contact_id IN (
  SELECT id FROM contacts WHERE source = 'kommo' AND organization_id = 'ddd271f1-a07f-4e68-9ae8-c861939354ae'
);

-- Clean contact_memories
DELETE FROM contact_memories WHERE contact_id IN (
  SELECT id FROM contacts WHERE source = 'kommo' AND organization_id = 'ddd271f1-a07f-4e68-9ae8-c861939354ae'
);

-- Clean custom field values
DELETE FROM custom_field_values WHERE organization_id = 'ddd271f1-a07f-4e68-9ae8-c861939354ae'
AND record_id IN (
  SELECT id FROM contacts WHERE source = 'kommo' AND organization_id = 'ddd271f1-a07f-4e68-9ae8-c861939354ae'
);

-- Delete orphan kommo contacts
DELETE FROM contacts WHERE source = 'kommo' AND organization_id = 'ddd271f1-a07f-4e68-9ae8-c861939354ae'