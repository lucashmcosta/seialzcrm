# Por que a criação do usuário falha (e como resolver)

## Causa confirmada

Nos registros da tentativa de criar `rlira@centraltrabalhista.com.br` (18/09, 13:15) o servidor recusou com:

`weak_password` — motivo `pwned` ("senha conhecida e fácil de adivinhar")

Ou seja: os dados estão corretos e as permissões estão corretas. O que barra é **a senha temporária digitada**, que consta em listas públicas de senhas vazadas. Essa verificação é uma configuração global do Supabase Auth (fora do app) e continua ligada — não tenho acesso de gerenciamento para desligá-la.

Resultado prático hoje: a tela mostra apenas "Edge Function returned a non-2xx status code", sem dizer que o problema é a senha.

## Solução imediata (sem mudar código)

Criar o usuário novamente usando uma senha forte e não óbvia (ex.: 10+ caracteres com letras, números e símbolo, sem palavras comuns, sem o ano). A pessoa troca depois em Meu Perfil → Segurança.

## Alteração que vou fazer na tela "Criar Usuário"

1. **Mostrar o motivo real do erro**: quando o servidor recusa, exibir a mensagem devolvida por ele em vez do texto genérico — inclusive uma mensagem clara em português para senha vazada: "Essa senha é muito comum e foi recusada. Use o gerador ou escolha outra."
2. **Botão de gerar senha forte** ao lado do campo de senha temporária (mesmo gerador já usado na criação de contas no Portal Admin), com opção de copiar.
3. **Aviso no campo**: mínimo de 6 caracteres mantido, com a observação de evitar senhas comuns.

Não altero permissões, limite de lugares, MFA, isolamento por organização nem o fluxo de criação em si.

## Detalhes técnicos

- `supabase/functions/create-user/index.ts`: já devolve `error: createAuthError.message`; ajustar apenas o mapeamento do caso `weak_password`/`pwned` para mensagem em PT-BR no corpo da resposta (sem mudar status nem autenticação).
- Front (diálogo de criar usuário em `src/pages/settings/UsersSettings.tsx` / componente do modal): ler o corpo JSON da resposta de erro do `functions.invoke` (hoje só o `error.message` genérico do SDK) e exibi-lo no toast; adicionar botão gerador de senha reaproveitando a função de `AdminCreateOrganizationDialog.tsx`.
- Sem migração de banco. A proteção contra senhas vazadas do Supabase Auth permanece ligada (pendente de acesso de gerenciamento, se você quiser desligá-la depois).
