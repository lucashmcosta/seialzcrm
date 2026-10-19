# Meta App Review — preparação global (19/10/2026)

App Meta: `1866027811023327`. As alterações são globais; não há exceção de interface ou regra codificada para a Viagi. A Viagi é somente o ambiente autorizado para o ensaio real.

## Escopo e status

A implementação é global e está em produção. A matriz abaixo separa os testes reais das verificações locais; operações ainda não executadas estão identificadas explicitamente.

| Item | Status | Alteração | Como validar na Viagi |
| --- | --- | --- | --- |
| 1 — en-US | Feito | Catálogo explícito de UI, toasts, acessibilidade e formatação por locale nas rotas do review e componentes usados por elas. Conteúdo de clientes, nomes de ativos e payloads técnicos não são traduzidos. | Com usuário en-US, percorrer Social, Marketing/Overview/Ads/Orgânico/Publicações/Comentários, todas as seções Meta, Profile e General; abrir estados vazios, modais e erros. |
| 2 — idioma | Feito | Salvamento confirma a linha atualizada e recarrega o contexto; remove retorno silencioso e preserva nomes. Usuário > padrão da org > pt-BR. Opção de herdar grava NULL; novos usuários sem preferência herdam. | Salvar English (US) no Profile, recarregar e conferir. Escolher herdar; alterar o padrão da org e conferir. Restaurar a preferência após o ensaio se necessário. |
| 3 — SDK | Feito | `en_US`/`pt_BR` conforme locale efetivo, tentativas após falha e recarga quando um SDK já carregado precisa mudar de idioma. | Abrir Login for Business com en-US; conferir diálogo em inglês. Repetir pt-BR fora da gravação. |
| 4 — capabilities | Feito | Publishing, Comments e DM têm status por canal, segundo conexão operacional, validade, ativos e grants. Social/Publicações/Comentários possuem liberação global própria; Campanhas/Webhooks mantêm sua flag existente. | Conferir canais ativos e permissões faltantes; abrir cada módulo pelos cards. |
| 5 — perfil Messenger | Feito | Busca PSID com first_name/last_name/profile_pic; cache por Página, 24h positivo/15min negativo; lista e cabeçalho atualizados; iniciais como fallback. Lucas Costa (papel no app confirmado pelo usuário) apareceu com nome e foto na lista e no cabeçalho no teste real. | Tester inicia uma conversa; conferir nome e foto na lista e no cabeçalho, inclusive após recarregar. |
| 6 — autor Facebook | Feito | Autor preservado quando retornado; foto opcional com nova tentativa sem expansão da foto; erros de carregamento deixam de parecer lista vazia. Comentário real de Lucas Costa mostrou nome e foto; resposta pelo CRM confirmada no Facebook. | Tester comenta em um post; conferir nome e, quando disponível, foto. |
| 7 — editar legenda | Feito | Editor apenas Facebook, validação de propriedade da Página no backend, atualização da lista e preservação do rascunho em erro. Publicação e edição reais confirmadas na Página Viagi. | Editar legenda de um post de teste da Página; abrir no Facebook e conferir a alteração. |
| 8 — agendamento | Não feito | Adiado conforme plano aprovado. Não há agendamento nativo Facebook nem job interno Instagram nesta entrega. | Retirar “schedule”, “scheduling”, “scheduled posts” e equivalentes das descrições e dos roteiros submetidos. |
| 9 — ocultar Instagram | Parcial | Botão e operação `hide`/`unhide`, com token do canal e confirmação de propriedade da mídia. Ocultação real confirmada: comentário de @lucashmcosta deixou de aparecer publicamente. A Meta omite o comentário oculto da listagem, portanto reexibir pelo CRM não ficou validado e não está disponível após essa atualização. | Ocultar comentário de teste no Instagram e conferir pelo perfil Tester; restaurar quando o estado retornado permitir. |
| 10 — conteúdo duplicado | Feito | View escolhe o snapshot mais recente, uma linha por org/plataforma/post, preservando histórico e RLS. | Conferir que cada post aparece uma vez em Orgânico → Conteúdo e que os totais não somam snapshots repetidos. |
| 11 — URL longa | Feito | Bolha com largura mínima zero e quebra em qualquer ponto; anexos respeitam a largura disponível. Corrigida também a largura do conteúdo interno do ScrollArea para o preview não deslocar o alvo do clique. | Abrir mensagem com URL longa em desktop e largura móvel; conferir que a bolha permanece dentro da conversa. |
| 12 — apagar Instagram | Feito | Botão removido e operação rejeitada no backend. Suporte de exclusão de mídia não foi confirmado para esta API/app. | Conferir que Instagram oferece Abrir, sem Apagar; Facebook mantém a ação existente. |
| 13 — system user → OAuth | Parcial | Autorização nova e credencial são persistidas atomicamente como pendentes. Seleção valida acesso, ativa a autorização e preserva as rotas dos módulos existentes. Conexões coexistem; OAuth novo não sobrescreve tokens anteriores. Login real e seleção concluídos: quarta conexão ready coexistindo com as três anteriores; fontes e ciphertexts anteriores preservados. A matriz abaixo explicita as operações verificadas e pendentes. | Registrar o baseline, concluir Login for Business, selecionar ativos e repetir as operações dos sete módulos abaixo. |

## Descrição para o App Review sem agendamento

> Seialz lets businesses publish posts to their connected Facebook Page and Instagram professional account, edit Facebook post captions, manage supported comments, and respond to Messenger and Instagram conversations.

Não demonstrar nem prometer agendamento ou exclusão de mídia Instagram. Os recursos de perfil e autoria devem ser demonstrados com uma conta com papel no app enquanto Business Asset User Profile Access não estiver aprovado.

## Baseline da Viagi e ensaio de continuidade

Em consulta somente de leitura em 19/10/2026, a org autorizada foi identificada pelo ID `b246ef6f-6242-4011-a112-6d8783d2896a` (há outras organizações chamadas Viagi). Foram encontradas **três** conexões `connected`, todas `system_user`, com os mesmos ativos selecionados. A flag canônica estava ativa. Lead Generation, CAPI e duas integrações WhatsApp estavam habilitados. Isso é evidência de configuração, não de funcionamento ponta a ponta.

| Módulo | Baseline observado | Após Login for Business |
| --- | --- | --- |
| Orgânico | Último sync de sucesso registrado em 24/08/2026; há execuções posteriores em erro/em andamento. | Insights e conteúdo carregados; 43 links/43 únicos em Conteúdo. Corrigida incompatibilidade preexistente do status partial no histórico. Após a correção, execuções reais fecharam como partial com completed_at às 19:16 UTC. Varredura completa/incremental ainda não certificada. |
| Lead Generation | Habilitado; UI mostrou ViagiApp conectado; ligação canônica existente. | Quatro formulários monitorados sincronizaram com success às 19:12 UTC, após OAuth, sem erros consecutivos. Novo lead de teste e vínculo no CRM não executados. |
| CAPI | Habilitado. | Configuração e rota preservadas. Nenhum evento de teste enviado: não há test_event_code configurado; o botão atual produziria eventos normais. Pendente comprovação no Events Manager. |
| WhatsApp | Duas integrações habilitadas; credenciais independentes do OAuth. | Duas mensagens inbound/delivered registradas após OAuth. Números/configurações preservados. Resposta de teste não executada; Verify não atualizou last_validated_at (handler usa maybeSingle apesar de duas integrações). |
| Social | Ativos e grants disponíveis nas conexões existentes. | Messenger: recebimento, nome/foto e resposta confirmada no Facebook. Instagram: mensagem enviada pelo usuário recebida com nome/foto; resposta aceita pela API e exibida no CRM às 19:15 UTC. Confirmação visual no celular do destinatário não coletada. |
| Publicações | Ativos e grants disponíveis. | Publicações reais FB e IG visíveis nas plataformas. Edição de legenda FB confirmada na Página. |
| Comentários | Ativos e grants disponíveis. | Facebook: autor Lucas Costa com foto e resposta confirmada. Instagram: autor @lucashmcosta identificado e comentário ocultado, confirmado em página pública. Reexibir segue limitação descrita no item 9. |

No ensaio, comparar IDs/fontes por módulo e fingerprints de credenciais antes/depois, sem exportar tokens. Não desconectar, revogar nem substituir o system user. A transição esperada é **coexistência com continuidade das fontes operacionais anteriores**. Uma troca explícita dessas fontes não faz parte deste trabalho.

## Verificações executadas

- TypeScript do app: `./node_modules/.bin/tsc -p tsconfig.app.json --noEmit`.
- Build Vite e páginas legais: `npm run build`.
- Deno: 10 testes de precedência de locale/nome, roteamento operacional, cache de perfil, autor de comentário e introspecção/troca de token.
- Bun: 4 testes de catálogo/interpolação, cobertura de chaves nas rotas, troca de locale do SDK e capabilities por conexão/permissão/ativo.
- `deno check` nas 20 funções que importam o helper de conexão Meta.
- PostgreSQL embarcado (PGlite): scripts SQL de herança de locale, deduplicação/RLS e continuidade OAuth. Validados: rollback de seleção inválida, rejeição entre organizações, preservação de ciphertext/ligação legada, estado pendente, único responsável pelo sync, grants restritos e primeira conexão sem vínculo legado artificial.
- Documentação: `npm run docs:validate`; whitespace: `git diff --check`.

Testes SQL reproduzíveis em um banco PostgreSQL 15+ **descartável e vazio**, com usuário autorizado a criar roles/tabelas:

```sh
psql -v ON_ERROR_STOP=1 -d meta_review_test -f tests/sql/locale-inheritance.sql
psql -v ON_ERROR_STOP=1 -d meta_review_test -f tests/sql/meta-oauth-continuity.sql
psql -v ON_ERROR_STOP=1 -d meta_review_test -f tests/sql/meta-media-dedup.sql
```

Os scripts usam transações e rollback. Não executá-los contra o banco de produção.

## Implantação

Migrations próprias: `20261019190001` a `20261019190005`. As numerações iniciais `20261019120000/121000/122000` colidiam com outra entrega já aplicada e foram renumeradas antes da implantação. Não executar um push indiscriminado de todas as migrations históricas.

As funções publicadas consultadas estavam com `verify_jwt=false`; os handlers validam JWT/membership ou a credencial de serviço prevista. Preservar essa configuração ao publicar, sem remover validações internas. Todos os consumidores do helper precisam receber a versão que respeita as rotas antes do ensaio OAuth. Publicar o frontend somente após as migrations e funções estarem disponíveis.

### Implantação e ensaio real executados

- PR #86 integrado em `fa7f8f3043a892ffead427f3cc014e6381cdd1ed`; Vercel Production reportou sucesso. Os 13 commits de implementação foram preservados.
- Cinco migrations aplicadas em uma única transação e registradas no histórico; 20 funções publicadas, todas com incremento de versão e `verify_jwt=false` preservado.
- A interface Meta e o Social foram abertos em inglês na Viagi. O DOM confirmou `https://connect.facebook.net/en_US/sdk.js`; o diálogo real de Login for Business estava em inglês.
- O portfólio correto dos ativos previamente compartilhados é **Viagi Consultoria Antiga**, `655239338645305`. O portfólio chamado apenas Viagi oferecia criar um compartilhamento adicional; esse caminho não foi confirmado.
- O usuário autorizou o consentimento dos ativos existentes. A Meta confirmou a conexão após verificação de autenticidade. Foram selecionados Página Viagi, Instagram viagi.br, Viagi Pixel e Viagi Ads Account.
- Às 18:51 UTC, o Seialz persistiu a nova autorização `f3c8d40f-0d66-4623-8674-b34bd7cc1e88`. A configuração do Login for Business emite `system_user`, portanto o teste foi **system user existente → novo system user via OAuth**.
- As três conexões anteriores permaneceram `connected/ready`; a nova passou de `pending` para `ready` após selecionar e salvar Página, Instagram e ad account no Seialz.
- Comparação após OAuth: os três fingerprints dos ciphertexts anteriores foram preservados; os cinco registros de integrações Meta permaneceram idênticos. Nenhum token foi exportado.
- Rotas `lead-generation`, `capi`, `asset:page`, `asset:instagram_account` e `asset:ad_account` continuaram na conexão anterior `d97ddc4c-c086-4099-9d0d-4d7567712813`.

Isso comprova coexistência e preservação das configurações. Os resultados reais estão na matriz; CAPI, novo lead e resposta WhatsApp ainda não têm certificação ponta a ponta.


### Evidências funcionais e limitações do ensaio

- Profile alternou pt-BR → en-US, persistiu após reload e mudou a UI. General mostra English (US) como padrão da Viagi; a herança sem preferência foi testada em SQL sem alterar o padrão da org de produção.
- PR [#87](https://github.com/lucashmcosta/seialzcrm/pull/87): corrigiu estados de carregamento, chave de nome do Profile e status de sync baseado na conexão operacional. Deploy de produção confirmado.
- PR [#89](https://github.com/lucashmcosta/seialzcrm/pull/89): correção do CHECK de sync parcial e registro final do ensaio.
- PR [#88](https://github.com/lucashmcosta/seialzcrm/pull/88): corrigiu o overflow da lista Social e o breadcrumb General. Build/CI e deploy de produção confirmados. Após reload, lista e botões mediram 319 px sem overflow; clique sem coordenadas abriu a conversa. Breadcrumb General confirmado em inglês.
- [Post Facebook de teste](https://www.facebook.com/122172979988963214/posts/122183671562963214): publicado pelo CRM e legenda editada, com comentário de Lucas e resposta da Viagi.
- [Post Instagram de teste](https://www.instagram.com/p/Der-YGFlxJA/): imagem publicada pelo CRM, comentário de @lucashmcosta recebido e ocultado. A imagem identifica explicitamente o teste técnico.
- A permissão de URLs de arquivo da extensão foi usada somente para anexar a imagem. Após o anexo, a opção foi desativada e o estado off foi confirmado.
- Posts e mensagens de teste permanecem nas plataformas; o comentário Instagram permanece oculto. Não foi feita exclusão permanente nem revogação de credenciais.
- Não houve envio de eventos CAPI artificiais sem código de teste, nem alteração dos tokens WhatsApp/system user.
- A migration adicional `20261019190006_meta_sync_partial_status.sql` amplia apenas o CHECK de status para aceitar `partial`, que o coletor já gravava. Nenhuma linha é removida ou reclassificada. Teste SQL reproduzível: `tests/sql/meta-sync-partial.sql` (PGlite passou).

### Commits por item

| Item | Commit |
| --- | --- |
| 1 | `8ae8a748` |
| 2 | `233876d5` |
| 3 | `1774eb2c` |
| 4 | `38c4585c` |
| 5 | `00a6d1f3` |
| 6 | `faa50485` |
| 7 | `62a883f4` |
| 8 | `70dd04c9` (adiamento/documentação) |
| 9 | `d23950d3` |
| 10 | `223de20d` |
| 11 | `0be96f82` |
| 12 | `1e1c0264` |
| 13 | `dc3a50f0` |

Os treze commits iniciais foram mantidos. As correções identificadas no ensaio foram registradas separadamente, sem reescrever o histórico já implantado.
