# Ligar número de WhatsApp em contas novas (erro "rota não encontrada")

## O que está acontecendo

O número `****2059` que aparece na tela pertence à conta **MSM Soluções Metálicas**, não à Squadra — por isso o erro continua mesmo depois de eu ter criado as rotas na Squadra. A MSM não tem nenhuma rota de WhatsApp cadastrada, e ligar um número exige a rota do destino (Comercial, Atendimento ou Pessoal) já existir na conta.

Causa raiz confirmada: a criação de conta nova não cria as rotas de WhatsApp. Hoje só Central Trabalhista, Viagi e Squadra (que eu acabei de corrigir) têm rotas; as outras 13 contas estão com zero. Ou seja, **toda conta nova nasce sem rotas e o vínculo do número sempre falha**.

## O que vou fazer

1. **Destravar a MSM agora**: criar as rotas Comercial e Atendimento na conta MSM Soluções Metálicas, para você concluir o vínculo do `****2059` imediatamente.
2. **Corrigir a origem**: a criação de conta nova passa a criar as duas rotas automaticamente, junto com as etapas do funil, os perfis e a assinatura. Contas novas nunca mais nascem sem rotas.
3. **Regularizar as contas existentes**: criar as rotas nas contas que hoje estão sem nenhuma, para o mesmo erro não aparecer nelas. Não mexo nas contas que já têm rotas (Central Trabalhista, Viagi, Squadra) — nada de duplicar nem renomear.
4. **Mensagem de erro melhor**: se por algum motivo a rota faltar, a tela passa a explicar em texto claro que a conta não tem a rota daquele destino, em vez de um código técnico.

## Detalhes técnicos

- Tabela `public.messaging_lines`; duas linhas por organização, no padrão já usado pela Central Trabalhista:
  - `key='commercial'`, `name='Comercial'`, `channel='whatsapp'`, `inbox_key='sales'`, `route_slug='commercial'`, `is_active=true`
  - `key='customer_service'`, `name='Atendimento'`, `channel='whatsapp'`, `inbox_key='customer_service'`, `route_slug='customer_service'`, `is_active=true`
- `active_endpoint_id` fica nulo: quem preenche é a RPC `provision_line_endpoint`, no momento do vínculo. Nenhuma rotação é criada.
- Semeadura das contas via `supabase--run_sql` (operação de dados), inserindo só onde não existe linha `whatsapp` com aquele `inbox_key` — idempotente, seguro para reexecutar.
- Criação de conta nova: `supabase/functions/admin-create-organization/index.ts` passa a inserir as duas linhas no mesmo fluxo em que cria etapas, perfis e assinatura, antes de retornar sucesso; falha na inserção aborta com erro explícito em vez de deixar a conta pela metade.
- O `purpose='vendor_personal'` usa a mesma rota `sales` (`inbox_key='sales'`), como já faz o `sales-route-operations`; não precisa de linha própria.
- Mensagem de erro: `src/components/integrations/evolution-whatsapp/EvolutionProvisionPanel.tsx` já mapeia `SALES_ROUTE_NOT_FOUND`; acrescento `CUSTOMER_SERVICE_ROUTE_NOT_FOUND` e deixo os dois textos explicando o que fazer.
- Nada muda no roteamento, nos gates canônicos, na fila de atribuição nem nos números já ligados.
