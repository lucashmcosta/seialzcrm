\set ON_ERROR_STOP on
BEGIN;
CREATE TABLE users(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),locale text DEFAULT 'pt-BR');
INSERT INTO users(locale) VALUES('en-US'),('pt-BR');
\ir ../../supabase/migrations/20261019190001_user_locale_inheritance.sql
INSERT INTO users DEFAULT VALUES;
DO $$ BEGIN
 ASSERT (SELECT count(*)=1 FROM users WHERE locale='en-US'), 'existing English preference must survive';
 ASSERT (SELECT count(*)=1 FROM users WHERE locale='pt-BR'), 'existing Portuguese preference must survive';
 ASSERT (SELECT count(*)=1 FROM users WHERE locale IS NULL), 'new users without explicit preference must inherit';
END $$;
ROLLBACK;
