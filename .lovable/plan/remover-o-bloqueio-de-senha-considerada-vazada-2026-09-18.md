# Remover o bloqueio de senha considerada vazada

## Escopo confirmado

- **Módulos afetados:** Configurações → Usuários, Portal Admin → Contas e demais fluxos que definem senha pelo Supabase Auth.
- **Documentação consultada:** `docs/README.md`, `docs/STATUS.md`, `docs/modules/settings/README.md`, `docs/platform/security/README.md`, `docs/operations/conflicts.md` e os registros de drift.
- **ADR aplicável:** ADR-0002 para a criação de contas pelo Portal Admin; MFA e autorização administrativa permanecem intactos.
- **Banco/RLS:** nenhuma alteração.
- **Edge Functions:** nenhuma remoção de autenticação ou autorização.
- **Integração externa:** configuração global do Supabase Auth.

## Diagnóstico confirmado

Os logs da tentativa de criar `rlira@centraltrabalhista.com.br` mostram `weak_password` com motivo `pwned`. O formulário e a função `create-user` aceitam senhas a partir de 6 caracteres; a recusa acontece depois, na proteção global do Supabase contra senhas conhecidas/vazadas.

## Alteração

1. Desativar no Supabase Auth somente a proteção contra senhas vazadas/fáceis de adivinhar.
2. Manter as regras mínimas já existentes no Seialz:
   - criação de usuário da conta: mínimo de 6 caracteres;
   - criação do primeiro administrador de um tenant: mínimo de 8 caracteres;
   - alteração da própria senha: mínimo de 8 caracteres.
3. Não alterar MFA, permissões, limite de usuários, isolamento por organização ou validação de sessão.

## Validação

- Repetir a criação de usuário pela tela mostrada com uma senha de 6 caracteres antes recusada.
- Confirmar que o usuário foi criado no Auth, em `users` e em `user_organizations`, com o perfil selecionado.
- Testar a criação de um tenant com senha de 8 caracteres antes recusada.
- Confirmar que erros reais passam a aparecer com a mensagem devolvida pelo servidor, em vez do texto genérico de falha da Edge Function.

## Impacto

A proteção contra senhas vazadas é uma configuração global: ao desligá-la, ela deixa de bloquear também cadastro público e troca da própria senha. Os mínimos de 6/8 caracteres continuam ativos conforme cada tela.
