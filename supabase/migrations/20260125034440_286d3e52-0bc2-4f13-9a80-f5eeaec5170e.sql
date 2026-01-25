-- Excluir oportunidades órfãs (sem contato vinculado) importadas do Kommo
DELETE FROM opportunities 
WHERE contact_id IS NULL 
  AND source_external_id LIKE 'kommo_%';

-- Excluir contatos sem telefone importados do Kommo
DELETE FROM contacts 
WHERE phone IS NULL 
  AND source_external_id LIKE 'kommo_%';