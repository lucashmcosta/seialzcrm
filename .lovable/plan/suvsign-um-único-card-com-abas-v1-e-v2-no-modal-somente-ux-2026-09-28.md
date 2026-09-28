# SuvSign: um único card, com abas V1 e V2 no modal (somente UX)

## Auditoria rápida
1. **Card e modal V1:** o card vem da grade em `IntegrationsSettings.tsx`. "Ver integração" abre o modal genérico `IntegrationDetailDialog.tsx` (Status, Conectado em, campos do V1, e os botões Editar / Reconfigurar / Desconectar).
2. **Painel V2 solto:** é o `SuvSignV2CredentialsCard.tsx`, renderizado acima da grade (linha 430). Só aparece para quem tem a permissão `canManageAI`.
3. **Estado e ações:**
   - V1 usa a linha `organization_integrations` e as ações do próprio modal.
   - V2 usa só `signature-requests` (`get_credentials_status`, `save_credentials`, `test_connection`). O navegador recebe apenas a chave mascarada.
4. **Dá para mover o V2 direto?** Sim. O V2 já é um componente isolado, então não é preciso extrair nada.

## O que muda
- **`IntegrationsSettings.tsx`:**
  - remove a linha 430, o painel solto;
  - passa ao modal uma nova informação opcional: "pode ver a aba V2" (`canManageAI`) e o id da organização.
- **`IntegrationDetailDialog.tsx`:** só quando `integration.slug === 'suvsign'`:
  - mostra as abas `V1 — Legado` e `V2 — Signing Engine` logo abaixo do cabeçalho, usando o `Tabs` do design system (`@/components/ui/tabs`). Abre sempre na aba V1;
  - **Aba V1:** mostra exatamente o conteúdo e os botões de hoje (Status, Conectado em, os campos, Editar, Reconfigurar, Desconectar), sem nenhuma mudança;
  - **Aba V2:** mostra o `<SuvSignV2CredentialsCard organizationId=… />` sem alterações. Os botões do V1 no rodapé ficam escondidos nessa aba, para ninguém desconectar o V1 pensando que está mexendo no V2;
  - se o usuário não tiver permissão, a aba V2 não aparece. É a mesma regra de hoje.
  - As outras integrações não mudam.
- **Troca de abas:**
  - os campos digitados no V2 são mantidos: o conteúdo das duas abas continua montado, e a aba escondida só fica invisível;
  - o V1 em modo de edição também continua como está;
  - ao fechar e reabrir o modal, ele volta para a aba V1.

## O que não muda
Não mudam o backend, as Edge Functions, o banco, as migrations, as flags, o armazenamento das credenciais, a lógica do V1 nem o status ou toggle do card.

## Ponto de atenção
O modal de detalhes só abre quando o V1 está conectado nessa organização. Na Central o V1 está conectado, então funciona. Numa organização sem V1 conectado, a aba V2 não fica acessível pelo card. Isso segue o pedido de não mudar a regra de status. [INCERTO] Se isso importar, pode ser revisto numa próxima tarefa.

## Validação
Com o Playwright, em `/settings/integrations`, confiro:
- que existe um único card SuvSign;
- que não há mais painel solto;
- que o modal abre com as duas abas;
- que o V1 mostra o mesmo conteúdo de antes;
- que o V2 mostra a chave mascarada e os botões;
- que trocar de aba e fechar/reabrir funciona.

Não clico em "Salvar" nem em "Testar conexão": esses botões gravam dados, e o código deles não muda. Depois vem o relatório com os 13 itens.
