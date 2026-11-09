-- Preço do Claude Opus 5.5, usado pelo "Perguntar" do widget Plamev com a chave da própria org. Sem esta linha o
-- custo estimado fica vazio e o gasto não soma no limite mensal da chave.
-- US$ 4 por milhão de tokens de entrada e US$ 20 por milhão de saída (tabela guarda por 1 mil).
INSERT INTO public.provider_pricing (provider, model, input_per_1k_usd, output_per_1k_usd, effective_from)
VALUES ('anthropic', 'claude-opus-5-5', 0.004, 0.02, '2026-11-09 00:00:00+00')
ON CONFLICT (provider, model, effective_from) DO NOTHING;
