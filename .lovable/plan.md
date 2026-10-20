# Corrigir modal "Nova oportunidade" cortado

## Problema
O modal não tem limite de altura nem rolagem. Com todos os campos (Valor, Estágio, Empresa, Contato, Responsável, Data, Origem comercial) ele fica mais alto que a janela, cortando o topo e o rodapé com os botões.

## Correção (só visual)
Arquivo: `src/components/opportunities/OpportunityDialog.tsx`
- `DialogContent`: `max-h-[90dvh]`, coluna flex, `overflow-hidden`, mantendo `sm:max-w-[500px]`.
- `form` vira coluna flex com `min-h-0 flex-1`.
- Cabeçalho (título) fixo no topo.
- Campos em um contêiner `flex-1 overflow-y-auto` com leve padding lateral.
- Rodapé (Cancelar/Salvar) fixo embaixo, sempre visível.

## Não será alterado
Campos, validações, salvamento, regras de fechamento e demais modais.
