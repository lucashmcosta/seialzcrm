-- 1. Update existing data in 'category' column (PT → EN)
UPDATE knowledge_items SET category = 'general' WHERE category = 'geral';
UPDATE knowledge_items SET category = 'contact_hours' WHERE category = 'horario_contato';
UPDATE knowledge_items SET category = 'payment' WHERE category = 'pagamento';
UPDATE knowledge_items SET category = 'policies' WHERE category = 'politicas';
UPDATE knowledge_items SET category = 'scope' WHERE category = 'escopo';
UPDATE knowledge_items SET category = 'language_guide' WHERE category = 'linguagem';
UPDATE knowledge_items SET category = 'glossary' WHERE category = 'glossario';
UPDATE knowledge_items SET category = 'product_service' WHERE category = 'produto_servico';
UPDATE knowledge_items SET category = 'pricing_plans' WHERE category = 'preco_planos';
UPDATE knowledge_items SET category = 'process' WHERE category = 'processo';
UPDATE knowledge_items SET category = 'requirements' WHERE category = 'requisitos';
UPDATE knowledge_items SET category = 'objections' WHERE category = 'objecoes';
UPDATE knowledge_items SET category = 'qualification' WHERE category = 'qualificacao';
UPDATE knowledge_items SET category = 'social_proof' WHERE category = 'prova_social';

-- 2. Update existing data in 'type' column (normalize old values)
UPDATE knowledge_items SET type = 'policies' WHERE type = 'policy';
UPDATE knowledge_items SET type = 'objections' WHERE type = 'objection';
UPDATE knowledge_items SET type = 'product_service' WHERE type = 'product';
UPDATE knowledge_items SET type = 'general' WHERE type = 'manual';

-- 3. Update category constraint
ALTER TABLE knowledge_items DROP CONSTRAINT IF EXISTS ki_category_check;
ALTER TABLE knowledge_items ADD CONSTRAINT ki_category_check CHECK (category IN (
  'general', 'contact_hours', 'payment', 'policies', 'scope', 'compliance',
  'language_guide', 'glossary', 'product_service', 'pricing_plans', 'process',
  'requirements', 'objections', 'qualification', 'faq', 'social_proof'
));

-- 4. Update type constraint (sync with categories)
ALTER TABLE knowledge_items DROP CONSTRAINT IF EXISTS knowledge_items_type_check;
ALTER TABLE knowledge_items ADD CONSTRAINT knowledge_items_type_check CHECK (type IN (
  'general', 'contact_hours', 'payment', 'policies', 'scope', 'compliance',
  'language_guide', 'glossary', 'product_service', 'pricing_plans', 'process',
  'requirements', 'objections', 'qualification', 'faq', 'social_proof'
));