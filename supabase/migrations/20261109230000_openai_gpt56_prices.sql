-- Modelos da OpenAI oferecidos ao agente. US$ por 1 mil tokens.
-- O GPT-5.6 Sol está em preço promocional até 30/11/2026.
insert into public.provider_pricing (provider, model, input_per_1k_usd, output_per_1k_usd, effective_from)
values ('openai', 'gpt-5.6-terra', 0.002, 0.012, '2026-11-09 00:00:00+00'),
       ('openai', 'gpt-5.6-sol', 0.004, 0.02, '2026-11-09 00:00:00+00'),
       ('openai', 'gpt-5.6-luna', 0.0002, 0.0012, '2026-11-09 00:00:00+00')
on conflict (provider, model, effective_from) do nothing;
