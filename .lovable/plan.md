# Rodízio: busca, grupos por perfil e filtro (só visual)

## O que muda na tela /settings/round-robin

Nas duas abas (Atendimento e Comercial), a lista da equipe ganha:

- **Busca** no topo ("Buscar pessoa..."), que filtra por nome ou e-mail enquanto você digita.
- **Filtro rápido** ao lado: "Todos" | "Só ativos na lista".
- **Grupos por perfil**: título com o nome do perfil e a contagem, por exemplo "Atendimento · 3 de 3 ativas".
  - Primeiro os grupos com alguém ativo, depois os outros, em ordem alfabética.
  - Dentro de cada grupo: ativas primeiro, depois as outras, em ordem alfabética.
  - Dá para abrir e fechar cada grupo. Os grupos com alguém ativo começam abertos, os outros fechados.
  - Enquanto há uma busca digitada, os grupos com resultado ficam abertos, para nenhum resultado ficar escondido.
- Quem **não pode participar** continua no final, em cinza e separado, e também é filtrado pela busca.
- Sem resultado: "Nenhuma pessoa encontrada."
- **Celular**: busca e filtro ficam um embaixo do outro, e os números de cada pessoa quebram linha sem sair da tela.

O que acontece ao ligar ou desligar alguém, as contagens e os avisos continuam iguais.

## Detalhes técnicos

- Novo `src/components/settings/RoundRobinPeopleList.tsx`, um componente só de apresentação: recebe `items` (`{id, name, email, profileName, active}`), `renderRow(item)` e `blocked` opcional; cuida da busca, do filtro, do agrupamento, da ordem e do recolher/abrir (Collapsible do shadcn, tokens semânticos).
- `CsRoundRobinTab.tsx`: o RPC `cs_round_robin_overview` não retorna e-mail nem perfil. Por isso a tela faz uma leitura extra de `user_organizations` (com `users(email)` e `permission_profiles(name)`) filtrada pela org e junta os dados pelo `user_id`. É só leitura, coberta pelas regras de acesso atuais, sem mudança no banco nem no RPC. Se essa leitura falhar, o perfil aparece como "Sem perfil" e o e-mail fica vazio.
- `RoundRobinSettings.tsx` (Comercial): já tem `email` e `profile_name`; só a lista passa a usar o componente. O toggle e os handlers continuam iguais. Se essa aba hoje não tem um grupo de quem não pode participar, ela não ganha um novo.
- Sem migration, policies, RPCs ou Edge Functions.
