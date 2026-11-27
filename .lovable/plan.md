# Corrigir rolagem do mouse na lista "Buscar tipo..."

## Problema
Na janela "Vincular como documento", a lista de tipos abre por cima da janela, mas fica fora da área que ela libera para rolagem. Por isso a roda do mouse não rola. Só a barra lateral funciona.

## Correção
- Em `AttachMediaDialog.tsx`, passar `modal` no `Popover` do seletor de tipo. Assim a lista libera a própria rolagem dentro da janela.
- Fazer o mesmo no `DocumentUploadWizard.tsx`, que usa o mesmo seletor dentro de uma janela e tem o mesmo problema.
- Nenhuma mudança de dados, de permissões ou em outras telas.

## Verificação
Abrir a janela, posicionar o mouse na lista e girar a roda: a lista tem que rolar até "Certidão de óbito" e mais abaixo.
