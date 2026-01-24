-- Deletar itens órfãos que não têm conteúdo original salvo
-- Esses itens foram criados antes do backup ser implementado
DELETE FROM knowledge_items 
WHERE status = 'processing' 
  AND (metadata->>'original_content') IS NULL;