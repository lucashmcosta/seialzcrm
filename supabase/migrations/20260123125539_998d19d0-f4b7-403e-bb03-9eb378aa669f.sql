-- Remove old constraint
ALTER TABLE knowledge_items DROP CONSTRAINT IF EXISTS knowledge_items_source_check;

-- Add new constraint with wizard_chat
ALTER TABLE knowledge_items 
ADD CONSTRAINT knowledge_items_source_check 
CHECK (source = ANY (ARRAY['wizard'::text, 'wizard_chat'::text, 'manual'::text, 'import_txt'::text, 'import_pdf'::text, 'import_docx'::text, 'import_md'::text, 'import_url'::text]));