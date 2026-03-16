

## Adicionar botão de "Sair" no Sidebar do tema Seialz

O sidebar do Seialz tem o avatar do usuário no footer mas não tem nenhum botão de logout — nem expandido, nem colapsado. O `onSignOut` é recebido como prop mas nunca usado.

### Mudança em `src/components/seialz/SeialzSidebar.tsx`

No footer do sidebar (linhas 148-167):

- **Quando expandido**: adicionar um botão de SignOut (ícone) ao lado do nome do usuário
- **Quando colapsado**: ao clicar no avatar, abrir um mini dropdown ou mostrar tooltip com opção de sair — ou mais simples: adicionar o ícone de SignOut abaixo do avatar

A abordagem mais limpa: quando expandido, mostrar o ícone `SignOut` como botão à direita do nome. Quando colapsado, adicionar um segundo item abaixo do avatar com o ícone SignOut (com tooltip "Sair" no hover, igual aos outros itens).

