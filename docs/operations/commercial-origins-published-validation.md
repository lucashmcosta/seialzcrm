# Publicação e validação de origens comerciais

Ambiente: `https://crm.seialz.com`; Supabase Seialz DB (`qvmtzfvkhkhkhdpclzua`).
Solicitação: publicar a implementação e testar no ambiente publicado.

## Ordem de execução

1. Integrar as alterações à versão remota atual, preservando mudanças já publicadas.
2. Validar migrations com o schema real dentro de transação revertida. Não executar o fixture mínimo em produção.
3. Executar build, tipos, testes de regras e checks dos webhooks da versão integrada.
4. Aplicar somente as duas migrations comerciais, com histórico de migração e camada desativada por padrão. Não reaplicar migrations antigas divergentes.
5. Publicar os quatro webhooks preservando autenticação atual e publicar o frontend.
6. Executar a matriz abaixo com registros sintéticos identificados e restritos ao teste. Verificar automações antes de inserir contatos/mensagens.
7. Verificar erros, registrar evidências e limpar os registros criados pelo teste. Não reprocessar contatos reais indiscriminadamente.

## Matriz de aceitação

| Área | Verificação | Evidência exigida |
| --- | --- | --- |
| Publicação | Rotas de configurações e relatório disponíveis | Navegador autenticado no domínio publicado |
| Regras | Criar/editar/desativar, exata e contém, normalização, prioridade e conflito | UI e decisões persistidas |
| Escopo | Mesmo texto com organizações/números diferentes | Decisões isoladas por tenant/endpoint |
| Captura | Entrada verificada gera origem para contato e oportunidade | Evento persistido, atribuição e histórico |
| Precedência | CTWA/GCLID prevalecem sobre regra; sinais contraditórios ficam pendentes | Resultado do evento |
| Origem inicial | Nova oportunidade não muda a origem inicial do contato | Duas oportunidades e contato conferidos |
| Segurança | Usuário limitado e outro tenant não acessam registros/RPCs alheios | Consultas sob papel authenticated |
| CRM | Badges, detalhes, correção manual, listas/Kanban, busca/paginação/filtros | UI com backend real |
| Relatório | Totais e detalhamento por origem/campanha/moeda | UI e registros reconciliados |
| Histórico | Prévia não altera; revisão obsoleta não aplica; reaplicação idempotente | Revisões e auditoria |
| Marketing | Campos legados de registros de teste não mudam por ações comerciais | Snapshot antes/depois |
| Compatibilidade | Marketing e CRM existentes continuam abrindo | Smoke em sessão real |
| Webhooks | Versões publicadas e fluxo HTTP com fixture controlado quando seguro | HTTP + banco; distinguir de entrega real do provedor |
| Mobile | Configurações, filtros, detalhes e relatório utilizáveis | Navegador com viewport mobile |

Não tratar simulação SQL como envio real Meta/Twilio/Google. Não disparar mensagens, conversões de anúncios ou notificações a clientes para validar a camada comercial.

## Execução em 28/09/2026

- Pré-publicação: `/settings/commercial-origins` redirecionava para `/settings`; `/commercial/origins` exibia 404.
- Banco: tabelas comerciais ausentes (`PGRST205` e `to_regclass` nulo).
- Base remota encontrada: `f2813f8b20437e7dcef765cd71c6319cc2d04feb`; integração em worktree separada, sem conflitos.
- Histórico de migrations local/remoto divergente. Publicar apenas as migrations novas com registro explícito, sem `db push --include-all`.
- Resultados restantes: pendentes de execução; nenhum E2E aprovado nesta etapa.
