-- Preço do modelo padrão dos recursos de texto com chave própria. Sem esta linha o custo
-- estimado fica vazio e o gasto não soma no limite mensal da chave.
-- US$ 3 por milhão de tokens de entrada e US$ 15 por milhão de saída (tabela guarda por 1 mil).
INSERT INTO public.provider_pricing (provider, model, input_per_1k_usd, output_per_1k_usd, effective_from)
VALUES ('anthropic', 'claude-sonnet-4-6', 0.003, 0.015, '2026-11-08 00:00:00+00')
ON CONFLICT (provider, model, effective_from) DO NOTHING;
