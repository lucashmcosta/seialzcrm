ALTER TABLE contacts ADD COLUMN created_by uuid;
ALTER TABLE contacts ADD COLUMN updated_by uuid;
ALTER TABLE opportunities ADD COLUMN created_by uuid;
ALTER TABLE opportunities ADD COLUMN updated_by uuid;