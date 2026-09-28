# Publicação e validação de origens comerciais

Ambiente: `https://crm.seialz.com`; Supabase Seialz DB (`qvmtzfvkhkhkhdpclzua`).
Solicitação: publicar a implementação e testar no ambiente publicado.

## Ordem de execução

1. Integrar as alterações à versão remota atual, preservando mudanças já publicadas.
2. Validar migrations com o schema real dentro de transação revertida. Não executar o fixture mínimo em produção.
3. Executar build, tipos, testes de regras e checks dos webhooks da versão integrada.
4. Aplicar somente as três migrations comerciais, com histórico de migração e camada desativada por padrão. Não reaplicar migrations antigas divergentes.
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

### Publicado

- Frontend integrado em `0d7e70cb`, com correções verificadas em `f3d85b47`. Publicação Vercel confirmada como `success`.
- Migrations `20260925120000`, `20260925121000` e `20260928130000` aplicadas e registradas no histórico. A terceira evita repetir consultas de permissão por registro.
- Funções ativas: `lead-webhook` v477, `twilio-whatsapp-webhook` v489, `meta-lead-ads-process-lead` v340 e `meta-whatsapp-webhook` v228. Configuração de autenticação anterior preservada.
- Central Trabalhista ativada. Outras organizações reais continuam desativadas por padrão; a capacidade existe para todos os tenants.

### Evidências obtidas

| Área | Resultado e alcance |
| --- | --- |
| Build/tipos | Build integrado, TypeScript e publicação Vercel aprovados; lint dos arquivos novos sem erros. |
| Regras/webhooks | 9 testes Deno aprovados e `deno check` dos quatro webhooks aprovado. |
| Schema real | `supabase/tests/commercial_published_transaction.sql` aprovado no banco publicado, com tenants sintéticos e `ROLLBACK`; usa os helpers reais de autenticação e não redefine RLS. |
| Segurança | Suite sob `authenticated`: outro tenant e usuário sem acesso ao responsável não leem/configuram registros; RPC interna bloqueada. |
| Regras na UI | Criação, edição, desativação, exata/contém, normalização, prioridade e conflito exercitados no publicado. Origem personalizada criada e desativada. |
| Captura HTTP | `lead-webhook` publicado: requisição sem chave rejeitada com 401; fixture isolado retornou 201 e criou contato/oportunidade Google por evidência direta. Chave temporária removida na limpeza. |
| Captura real observada | Entradas espontâneas da Central produziram atribuições Meta por evidência direta e Google por regra. Conferência após limpeza: Google = 1 contato e 1 oportunidade; Meta = 3 contatos e 3 oportunidades. Auditoria final sem `process_error` na organização. Não foram enviadas mensagens pelo teste. |
| CRM desktop | Contato sintético, correção manual, histórico, oportunidade com contato pré-selecionado e origem independente; badges, filtros, Kanban/lista, paginação até página 2 e visualização salva exercitados. |
| Relatório | Filtro Manual reconciliou 1 contato Google e 1 oportunidade Meta de R$ 123; detalhamento abriu a oportunidade esperada. Filtro restaurado depois. |
| Histórico | Suite real comprova prévia sem escrita, recusa de revisão obsoleta, aplicação de revisão atual e reaplicação idempotente. Não houve reprocessamento em massa de clientes reais. |
| Marketing | Suite compara integralmente linhas legadas antes/depois; fontes/campanhas dos registros de UI preservadas. Página Marketing abriu normalmente. |
| Mobile | Viewport 390 × 844: filtros e cartões de contatos/Kanban, configurações, detalhe e relatório exercitados. Configurações, detalhe e relatório com largura do documento de 390 px, sem overflow da página. |
| Limpeza | Contatos/oportunidades, regras, origem, visualização salva e tenant/chave HTTP sintéticos removidos; dados reais e regra Google preservados. |

### Correções encontradas durante o E2E

- Botões de cadastro de origem/regra e correção manual passaram a submeter seus formulários explicitamente.
- Criação pelo detalhe do contato passou a mostrar a seleção comercial e carregar o contato pré-selecionado mesmo fora da primeira página de opções.
- Consultas comerciais deixaram de avaliar permissões por linha. Medição SQL com o volume real: contatos (17.829) em 320 ms; Kanban (18.048) em 895 ms; relatório (18.048) em 1.022 ms. São medições do banco, não tempos completos de navegação.
- Lista de contatos atualiza ao alternar entre desktop e mobile.
- Uma publicação concorrente reverteu as duas últimas correções de formulário/mobile. Foram reaplicadas sobre a nova main, preservando as alterações concorrentes, e o cadastro foi retestado no domínio publicado.

### Regra Google e limites da validação

A regra existente **Msg Google** foi preservada: igualdade com **Gostaria de falar com um Advogado Trabalhista**, origem **Google Ads**, número **Central Trabalhista - Comercial**, sem campanha comercial vinculada. O simulador confirmou a correspondência nesse número e a ausência dela sem o número. O usuário confirmou que o texto Google será diferente do Meta. A auditoria também encontrou atribuições reais por essa regra.

O E2E cobre UI publicada, banco real e chamada HTTP controlada. Não equivale a um clique pago realizado pelo teste nem a um envio controlado de cada provedor Meta/Twilio. Não houve teste de entrega de conversões CAPI/Google; essas rotinas não foram modificadas. Observar uma classificação pela frase não comprova, por si só, que a pessoa clicou no anúncio. Mensagens editadas pelo visitante podem deixar de corresponder à regra exata.

## Correção após conferência do histórico (28/09/2026)

A primeira validação cobriu novas entradas e não comprovou cobertura histórica. O relato do usuário revelou que o importador exigia `commercial_entry`, inexistente nas mensagens anteriores à publicação. O cadastro de regra também não reavaliava as entradas antigas. A aprovação inicial, portanto, não era suficiente para afirmar que o histórico estava coberto.

Auditoria: 12.278 contatos com CTWA, 9.636 primeiras mensagens com referral Meta e 178 primeiras mensagens com a frase Google. A regra original cobria apenas 7067 (20 primeiras mensagens). O usuário confirmou exclusividade Google também no 7020 (158), autorizando uma segunda regra restrita a esse endpoint.

Correção `59bac82c`, migration `20260928150000`: recuperação com evidência inicial, preservação de atribuições conhecidas/manuais, vínculos históricos explícitos conforme os critérios documentados no guia, decoder de referral antigo Meta/Twilio e fila persistente ao ativar organização/salvar regra. A UI mostra andamento e atualiza o relatório; percentual sem origem usa uma casa decimal.

Validação: build, TypeScript, lint e suíte `supabase/tests/commercial_history_recovery.sql` aprovados. A suíte no schema real, com rollback integral, cobre dados anteriores ao marcador, número correto/incorreto, mensagem posterior, mídia, snapshot tardio, várias oportunidades, correção manual, idempotência, preservação integral dos campos legados e isolamento de RPC. Simulação com 100 contatos reais recuperou 162 atribuições e foi revertida antes da aplicação.

Resultado final: fila concluída em 28/09/2026 às 14:27 UTC, com **17.840 contatos examinados e 28.684 atribuições preenchidas**. Um lote operacional de 2.000 contatos ultrapassou 55 s e foi integralmente revertido; a execução foi retomada com 1.000 por chamada, sem perda do cursor já confirmado. O worker periódico usa 200 por lote.

Conferência agregada após recuperação (os totais crescem com novas entradas):

| Recorte | Meta Ads | Google Ads | Não identificada |
| --- | ---: | ---: | ---: |
| Contatos, todo o histórico | 14.078 | 249 | 3.512 |
| Oportunidades, todo o histórico | 14.150 | 225 | 3.684 |
| Oportunidades, 01–28/09/2026 | 2.849 | 64 | 612 (17,4%) |

Há também 4 contatos e 4 oportunidades de acesso direto no histórico. As 178 primeiras mensagens exatas auditadas passaram a Google: 158 do 7020 e 20 do 7067. O total Google é maior porque existem outras evidências, como marcadores de entrada.

Restam 384 contatos com CTWA armazenado, mas sem aquisição inicial reconstruída: 381 têm referral capturado após a janela inicial; 3 têm referral anterior à criação/importação do contato. Apenas 7 desses 384 contatos foram criados no período de setembro. A simples presença do referral mais recente não prova a primeira aquisição. O sistema não copiou essa origem para todas as oportunidades. Os 612 casos sem origem de setembro incluem outros registros sem evidência suficiente; não são todos CTWA.

UI publicada conferida: status de conclusão nas configurações, Google 7020 no simulador, relatório com percentual decimal, detalhamento reconciliado em 64 oportunidades Google no período e oportunidade antiga de 26/09 com mensagem original e motivo auditado. A entrada histórica aparece como **Entrada inicial reconstruída** (`0d6993cb`). Tipos, lint e publicação Vercel aprovados. Zero `process_error` e zero organizações sintéticas remanescentes.

A correção altera apenas a camada comercial; a suíte compara as linhas legadas integralmente. A auditoria anterior à recuperação tinha 26 atribuições comerciais; duas entradas antes desconhecidas foram preenchidas. As 18 atribuições já conhecidas/protegidas permaneceram inalteradas (0 alterações).
