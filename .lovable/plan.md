# Busca no seletor de tipo de documento (SuvSign V2)

Trocar o seletor simples de cada modelo por um seletor com campo de busca, mantendo o resto igual.

## O que muda para você
- Ao clicar no seletor de tipo de um modelo, abre uma lista com um campo "Buscar tipo..." no topo.
- Digitar filtra os tipos na hora (sem diferenciar acentos/maiúsculas).
- Continuam os grupos "Do contato" e "Da oportunidade" e a opção "Sem tipo".
- Salvar funciona exatamente como hoje (ao escolher, grava).

## Detalhes técnicos
- Arquivo único: `src/components/settings/SuvSignV2TemplateTypesCard.tsx`.
- Substituir `Select` por `Popover` + `Command` (shadcn já existentes), com `CommandInput`, `CommandGroup` por origem e `CommandEmpty` "Nenhum tipo encontrado".
- Reutilizar a mesma função `change(tpl, v)`; sem alteração em banco, RLS, edge functions ou lógica de gravação.
