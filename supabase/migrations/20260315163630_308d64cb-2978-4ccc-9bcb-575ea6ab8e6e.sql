-- Delete activities by imported IDs
DELETE FROM activities WHERE id IN (
  SELECT unnest(imported_activity_ids) FROM import_logs WHERE id = 'c52a0a5e-0d37-43cc-96f1-d56c5fb9e1dd'
);

-- Delete custom_field_values for imported records
DELETE FROM custom_field_values WHERE organization_id = 'ddd271f1-a07f-4e68-9ae8-c861939354ae'
AND record_id IN (
  SELECT unnest(imported_contact_ids || imported_opportunity_ids || imported_company_ids)
  FROM import_logs WHERE id = 'c52a0a5e-0d37-43cc-96f1-d56c5fb9e1dd'
);

-- Delete opportunities
DELETE FROM opportunities WHERE id IN (
  SELECT unnest(imported_opportunity_ids) FROM import_logs WHERE id = 'c52a0a5e-0d37-43cc-96f1-d56c5fb9e1dd'
);

-- Delete remaining activities tied to contacts
DELETE FROM activities WHERE contact_id IN (
  SELECT unnest(imported_contact_ids) FROM import_logs WHERE id = 'c52a0a5e-0d37-43cc-96f1-d56c5fb9e1dd'
);

-- Delete contact_memories
DELETE FROM contact_memories WHERE contact_id IN (
  SELECT unnest(imported_contact_ids) FROM import_logs WHERE id = 'c52a0a5e-0d37-43cc-96f1-d56c5fb9e1dd'
);

-- Delete contacts
DELETE FROM contacts WHERE id IN (
  SELECT unnest(imported_contact_ids) FROM import_logs WHERE id = 'c52a0a5e-0d37-43cc-96f1-d56c5fb9e1dd'
);

-- Delete companies
DELETE FROM companies WHERE id IN (
  SELECT unnest(imported_company_ids) FROM import_logs WHERE id = 'c52a0a5e-0d37-43cc-96f1-d56c5fb9e1dd'
);

-- Delete kommo custom field definitions
DELETE FROM custom_field_definitions WHERE organization_id = 'ddd271f1-a07f-4e68-9ae8-c861939354ae'
AND source_external_id LIKE 'kommo_field_%';

-- Mark as rolled back
UPDATE import_logs SET status = 'rolled_back', rollback_available = false, rollback_executed_at = now() WHERE id = 'c52a0a5e-0d37-43cc-96f1-d56c5fb9e1dd'