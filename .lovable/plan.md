# Etapa 1 — B4 a B7 (sem organização de teste)

## Mudança no B1
- Sai a criação da organização "Seialz Teste Permissões" e dos 4 usuários de teste.
- O interruptor rbac_v2 fica como está: desligado, sem nenhuma organização na lista.

## B4 — Travas no servidor (só valem com o interruptor ligado)
- Funções novas: permissões do meu perfil, pessoas das minhas equipes, e checagem de escopo (nenhum / meus / equipe / todos, mais a opção "sem responsável").
- Contatos, oportunidades, conversas (comerciais e atendimento), mensagens, chamadas e tarefas: cada regra passa a ser "se ligado, regra nova; senão, a regra de hoje, idêntica".
- Atividades, documentos, perfis de identidade e campos personalizados: só aparecem se o contato ou a oportunidade de origem estiver visível.
- Webhooks, Edge Functions e funções internas continuam livres.
- Verificação: em 3 usuários não-Admin de organizações reais, com o interruptor desligado, as contagens visíveis ficam iguais antes e depois. Se mudar, desfaço o B4 e paro.

## B5 — Telas (só aparecem com o interruptor ligado)
- Permissões carregam o modelo novo, e as chaves antigas continuam disponíveis.
- Perfis de Permissão: lista, novo perfil (modelo pronto, cópia ou em branco), editor com abas Dados / Ferramentas / Administração, resumo e exclusão com destino obrigatório. Os 6 modelos prontos são os do documento.
- Equipes: card novo em Configurações, com coluna "Equipes" em Usuários.
- Menus, rotas e cards de Configurações seguem as permissões novas, com bloqueio de rota de verdade. O controle de privacidade da organização fica oculto.

## B6 — Teste por simulação (nada fica gravado)
- Uma organização real e usuários reais não-Admin, dentro de uma transação desfeita no final.
- Dentro dela:
  - ligo o interruptor só para essa organização e rodo a conversão dos perfis dela;
  - crio a equipe A, com 2 pessoas, e a equipe B, com 1;
  - aplico os modelos Vendedor e Líder de equipe;
  - crio registros temporários com responsáveis diferentes.
- O que vou conferir:
  - o Vendedor vê só os próprios registros;
  - o Líder vê os da equipe A e não os da B;
  - quem está na B não vê os da A;
  - trocar alguém de equipe muda a visibilidade na hora;
  - só o Admin grava perfis e equipes;
  - excluir um perfil exige escolher para onde vão as pessoas.
- Depois de desfazer, confirmo no log que nada ficou gravado. Se algo falhar e eu não conseguir corrigir, paro.

## B7 — Ligar para todos, com checagem automática
1. Foto antes: para cada não-Admin ativo, guardo as contagens visíveis (contatos, oportunidades, conversas por área, tarefas, chamadas, atividades) e os menus que ele vê.
2. Converto os perfis de todas as organizações.
3. Ligo o interruptor para todos.
4. Foto depois, com as mesmas contagens e menus.
5. Se qualquer número ou menu divergir, desligo na hora, registro só os nomes dos perfis e o que mudou, e paro.
6. Se bater 100%, deixo ligado e registro a data e a hora.

## Relatório final
- Log completo, com a comparação antes/depois.
- Tabela dos perfis convertidos por organização, e a lista dos que mudam quando o Admin salvar o perfil pela primeira vez.
- Comando de emergência: `SELECT rbac_v2_set_global(false);`
- Telas com erro, itens não aplicados e uma lista curta do que conferir manualmente com o seu login de Admin e com o de um operador.

## Detalhes técnicos
- Cada item tem a sua mudança no banco e o seu arquivo para desfazer em docs/platform/security/rbac-v2/rollback/.
- As regras usam `CASE WHEN rbac_v2_enabled(org) THEN nova ELSE atual END`, e a RPC da lista de conversas continua com uma assinatura só.
- A simulação usa `set local role authenticated` com `request.jwt.claims` e o resultado sai por `RAISE` para forçar o desfazer.
