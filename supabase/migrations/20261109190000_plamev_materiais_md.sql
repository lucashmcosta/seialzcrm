-- Texto (Markdown) de cada material da Plamev. O "Perguntar" lê o texto só depois de revisado: até lá continua lendo
-- o arquivo, porque um erro de conversão viraria carência errada para o cliente. O arquivo segue sendo o que vai no WhatsApp.
alter table public.plamev_materials
  add column if not exists conteudo_md text check (conteudo_md is null or length(conteudo_md) <= 200000),
  add column if not exists md_status text not null default 'sem'
    check (md_status in ('sem', 'gerando', 'gerado', 'revisado', 'erro')),
  add column if not exists md_erro text,
  add column if not exists md_gerado_em timestamptz,
  add column if not exists md_revisado_em timestamptz,
  add column if not exists md_revisado_por_auth_user_id uuid;

-- Modelos do "Perguntar" e do teste de comparação. US$ por 1 mil tokens.
insert into public.provider_pricing (provider, model, input_per_1k_usd, output_per_1k_usd, effective_from)
values ('anthropic', 'claude-sonnet-5-5', 0.002, 0.01, '2026-11-09 00:00:00+00'),
       ('anthropic', 'claude-haiku-5-5', 0.0001, 0.0005, '2026-11-09 00:00:00+00')
on conflict (provider, model, effective_from) do nothing;
