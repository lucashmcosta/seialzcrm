# Corrigir rolagem com a roda do mouse em listas dentro de janelas

## Resultado da análise
Procurei todas as listas de seleção com busca (o mesmo tipo do "Buscar tipo") no sistema e verifiquei quais ficam dentro de uma janela.

- **Com o mesmo problema:** a lista de seleção da janela de **Tarefa** (criar/editar tarefa).
- **Já corrigido:** "Vincular como documento".
- **Sem o problema** (não ficam dentro de janela): filtros do Comercial, filtros de oportunidades, etiquetas da oportunidade, regras de documentos e tipos SuvSign em Configurações, seletor de organização da Observabilidade, e seletores de emoji das conversas.

## O que será feito
- Aplicar na janela de Tarefa a mesma correção usada em "Vincular como documento".

## Detalhes técnicos
- `src/components/tasks/TaskDialog.tsx:60`: `<Popover open={open} onOpenChange={setOpen}>` → adicionar `modal`.
- Nada mais muda.
