-- Corrigir telefones existentes que não estão em formato E.164
UPDATE contacts 
SET phone = '+55' || phone 
WHERE phone IS NOT NULL 
  AND phone NOT LIKE '+%'
  AND LENGTH(phone) >= 10;