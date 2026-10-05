# Ocultar o botão do contrato V1 e pôr o V2 no lugar

## O que muda
- No topo da oportunidade, o ícone de caneta deixa de abrir o envio V1 e passa a abrir o envio V2 (o mesmo painel do item "Enviar contrato V2 (Piloto)").
- Vale só onde o piloto V2 está ligado (Central Trabalhista). Nas outras organizações o botão V1 continua aparecendo, para ninguém ficar sem forma de enviar contrato.
- O item "Enviar contrato V2 (Piloto)" do menu de três pontinhos continua lá.
- Solicitações V2 já existentes continuam acessíveis pelo mesmo painel.

## Como voltar rápido
- Em `src/components/signature/ContractSignatureEntry.tsx` haverá uma única constante `HIDE_V1_BUTTON = true`. Trocar para `false` faz o botão V1 voltar exatamente como hoje.

## O que não muda
- O fluxo V1 (`SendToSignatureButton`) não é removido nem alterado.
- Sem mudanças no servidor, banco, flags, Edge Functions ou na SuvSign.

## Detalhes técnicos
- `ContractSignatureEntry`: quando `HIDE_V1_BUTTON && pilot_enabled`, não renderiza `SendToSignatureButton`; renderiza no lugar um botão ícone `PenNib` (mesmo tamanho/estilo, `aria-label="Enviar contrato"`) que abre `SignatureV2Sheet` com `canCreate`.
- Sem piloto, ou com a constante `false`: comportamento atual.
- Validação: build OK e conferência visual do topo da oportunidade.
