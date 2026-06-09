Remover os 2 contatos de teste da org Viagi:
- Teste Atribuicao V2 (teste) — teste-attrib-v2@viagi.com.br
- Teste E2E Viagi (teste) — teste-e2e@viagi.com.br

Vou identificá-los pelos emails e executar DELETE em `public.contacts` filtrando por esses emails dentro das organizações da Viagi. Dados relacionados (opportunities, messages, threads, etc.) serão removidos por cascade/soft-delete conforme triggers existentes.