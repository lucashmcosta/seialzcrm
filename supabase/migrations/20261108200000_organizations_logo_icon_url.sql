-- Ícone da org para o menu lateral recolhido (só ícones, 64px).
-- Opcional: sem ícone, o menu recolhido usa o logo (reduzido) ou o ícone padrão.
-- Coluna nullable e aditiva: o frontend tolera a ausência dela (lê em consulta separada).
ALTER TABLE public.organizations ADD COLUMN IF NOT EXISTS logo_icon_url text;
COMMENT ON COLUMN public.organizations.logo_icon_url IS 'Ícone quadrado exibido no menu lateral recolhido.';
