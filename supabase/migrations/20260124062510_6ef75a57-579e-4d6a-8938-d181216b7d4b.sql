-- Fase 1: Deletar FAQs separados criados pelo wizard
DELETE FROM knowledge_items 
WHERE (title LIKE 'FAQ -%' OR category = 'faq') 
  AND source = 'wizard';

-- Fase 2: Deletar rascunhos
DELETE FROM knowledge_items 
WHERE title LIKE '%(Rascunho)%';

-- Fase 3: Manter apenas o mais recente por categoria/escopo/produto
WITH ranked AS (
  SELECT id,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, category, scope, COALESCE(product_id::text, 'null')
      ORDER BY created_at DESC
    ) as rn
  FROM knowledge_items
  WHERE source = 'wizard'
)
DELETE FROM knowledge_items 
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);