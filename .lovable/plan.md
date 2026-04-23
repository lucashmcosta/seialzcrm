

## Remover opção de reset de senha do `EditUserDialog`

### Mudança
Em **`src/components/settings/EditUserDialog.tsx`**, remover toda a seção "Resetar senha":

- Bloco JSX da seção (incluindo o `<Separator />` que a antecede e o botão "Enviar reset")
- Handler `handleResetPassword`
- Estado `resetting` (`useState`)
- Imports não usados após a remoção: `KeyReturn` (de `@phosphor-icons/react`)

O `SpinnerGap` e `Upload` continuam em uso pelo upload de avatar e pelo botão Salvar.

### Resultado
Modal fica com apenas duas seções: **Dados pessoais** e **Permissão e status**. Sem fluxo de reset de senha por enquanto.

### Fora do escopo
- Criar página `/reset-password` ou edge function de geração de link (descartado)
- Qualquer alteração no fluxo de auth existente

