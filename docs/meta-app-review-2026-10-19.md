# Meta App Review — preparação global (19/10/2026)

App Meta: `1866027811023327`. As alterações são globais; não há exceção de interface ou regra codificada para a Viagi. A Viagi é somente o ambiente autorizado para o ensaio real.

## Escopo e status

“Feito” abaixo descreve a implementação e a verificação local. Não certifica uma chamada real à Meta. A matriz de ensaio registra separadamente a validação em produção.

| Item | Status | Alteração | Como validar na Viagi |
| --- | --- | --- | --- |
| 1 — en-US | Feito | Catálogo explícito de UI, toasts, acessibilidade e formatação por locale nas rotas do review e componentes usados por elas. Conteúdo de clientes, nomes de ativos e payloads técnicos não são traduzidos. | Com usuário en-US, percorrer Social, Marketing/Overview/Ads/Orgânico/Publicações/Comentários, todas as seções Meta, Profile e General; abrir estados vazios, modais e erros. |
| 2 — idioma | Feito | Salvamento confirma a linha atualizada e recarrega o contexto; remove retorno silencioso e preserva nomes. Usuário > padrão da org > pt-BR. Opção de herdar grava NULL; novos usuários sem preferência herdam. | Salvar English (US) no Profile, recarregar e conferir. Escolher herdar; alterar o padrão da org e conferir. Restaurar a preferência após o ensaio se necessário. |
| 3 — SDK | Feito | `en_US`/`pt_BR` conforme locale efetivo, tentativas após falha e recarga quando um SDK já carregado precisa mudar de idioma. | Abrir Login for Business com en-US; conferir diálogo em inglês. Repetir pt-BR fora da gravação. |
| 4 — capabilities | Feito | Publishing, Comments e DM têm status por canal, segundo conexão operacional, validade, ativos e grants. Social/Publicações/Comentários possuem liberação global própria; Campanhas/Webhooks mantêm sua flag existente. | Conferir canais ativos e permissões faltantes; abrir cada módulo pelos cards. |
| 5 — perfil Messenger | Parcial | Busca PSID com first_name/last_name/profile_pic; cache por Página, 24h positivo/15min negativo; lista e cabeçalho atualizados; iniciais como fallback. Falta comprovação real com Tester. | Tester inicia uma conversa; conferir nome e foto na lista e no cabeçalho, inclusive após recarregar. |
| 6 — autor Facebook | Parcial | Autor preservado quando retornado; foto opcional com nova tentativa sem expansão da foto; erros de carregamento deixam de parecer lista vazia. Falta comprovação com Tester. | Tester comenta em um post; conferir nome e, quando disponível, foto. |
| 7 — editar legenda | Parcial | Editor apenas Facebook, validação de propriedade da Página no backend, atualização da lista e preservação do rascunho em erro. Falta chamada real em post de teste. | Editar legenda de um post de teste da Página; abrir no Facebook e conferir a alteração. |
| 8 — agendamento | Não feito | Adiado conforme plano aprovado. Não há agendamento nativo Facebook nem job interno Instagram nesta entrega. | Retirar “schedule”, “scheduling”, “scheduled posts” e equivalentes das descrições e dos roteiros submetidos. |
| 9 — ocultar Instagram | Parcial | Botão e operação `hide`/`unhide`, com token do canal e confirmação de propriedade da mídia. Falta validação real do contrato e da leitura do estado oculto. | Ocultar comentário de teste no Instagram e conferir pelo perfil Tester; restaurar quando o estado retornado permitir. |
| 10 — conteúdo duplicado | Feito | View escolhe o snapshot mais recente, uma linha por org/plataforma/post, preservando histórico e RLS. | Conferir que cada post aparece uma vez em Orgânico → Conteúdo e que os totais não somam snapshots repetidos. |
| 11 — URL longa | Feito | Bolha com largura mínima zero e quebra em qualquer ponto; anexos respeitam a largura disponível. | Abrir mensagem com URL longa em desktop e largura móvel; conferir que a bolha permanece dentro da conversa. |
| 12 — apagar Instagram | Feito | Botão removido e operação rejeitada no backend. Suporte de exclusão de mídia não foi confirmado para esta API/app. | Conferir que Instagram oferece Abrir, sem Apagar; Facebook mantém a ação existente. |
| 13 — system user → OAuth | Parcial | Autorização nova e credencial são persistidas atomicamente como pendentes. Seleção valida acesso, ativa a autorização e preserva as rotas dos módulos existentes. Conexões coexistem; OAuth novo não sobrescreve tokens anteriores. Falta ensaio real completo. | Registrar o baseline, concluir Login for Business, selecionar ativos e repetir as operações dos sete módulos abaixo. |

## Descrição para o App Review sem agendamento

> Seialz lets businesses publish posts to their connected Facebook Page and Instagram professional account, edit Facebook post captions, manage supported comments, and respond to Messenger and Instagram conversations.

Não demonstrar nem prometer agendamento ou exclusão de mídia Instagram. Os recursos de perfil e autoria devem ser demonstrados com uma conta com papel no app enquanto Business Asset User Profile Access não estiver aprovado.

## Baseline da Viagi e ensaio de continuidade

Em consulta somente de leitura em 19/10/2026, a org autorizada foi identificada pelo ID `b246ef6f-6242-4011-a112-6d8783d2896a` (há outras organizações chamadas Viagi). Foram encontradas **três** conexões `connected`, todas `system_user`, com os mesmos ativos selecionados. A flag canônica estava ativa. Lead Generation, CAPI e duas integrações WhatsApp estavam habilitados. Isso é evidência de configuração, não de funcionamento ponta a ponta.

| Módulo | Baseline observado | Após Login for Business |
| --- | --- | --- |
| Orgânico | Último sync de sucesso registrado em 24/08/2026; há execuções posteriores em erro/em andamento. | Pendente: sync incremental e leitura dos insights. |
| Lead Generation | Habilitado; UI mostrou ViagiApp conectado; ligação canônica existente. | Pendente: lead de teste no formulário, ingestão e vínculo no CRM. |
| CAPI | Habilitado. | Pendente: evento com test_event_code, retorno e Events Manager. |
| WhatsApp | Duas integrações habilitadas; credenciais independentes do OAuth. | Pendente: entrada e resposta pelo número de teste autorizado. |
| Social | Ativos e grants disponíveis nas conexões existentes. | Pendente: receber e responder nos dois canais; foto/nome do Tester. |
| Publicações | Ativos e grants disponíveis. | Pendente: publicar FB/IG e editar legenda FB em conteúdo de teste. |
| Comentários | Ativos e grants disponíveis. | Pendente: ler autor Tester, responder e ocultar comentário de teste. |

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

A validação local não substitui o ensaio real registrado acima. O Login for Business e os testes com Tester permanecem pendentes até que haja evidência de execução.
