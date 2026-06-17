## Objetivo

Adicionar um botão de filtro (ícone funil) no header da página **Mensagens**, ao lado dos botões existentes (download / nova conversa / contador 47). Ao clicar, abre um modal que permite filtrar a lista de conversas pelo **número WhatsApp** de entrada — útil para distinguir o número novo do antigo.

## Escopo

- Apenas frontend, na página `/messages` (desktop). Mobile fica fora.
- Sem alterar regras de negócio nem backend.
- Aproveita `useOrgWhatsAppEndpoints` (já importado) para listar os números da org e `useThreadEndpointMap` (já importado) para saber o `primary_endpoint_id` de cada thread.

## Mudanças

1. **`src/pages/messages/MessagesList.tsx`**
   - Novo estado `endpointFilter: string | 'all'` (default `'all'`), persistido via `usePersistedFilters` para sobreviver à navegação.
   - Novo estado `endpointFilterOpen: boolean` para o modal.
   - No header (mesma linha onde estão os ícones de download / nova conversa / contagem), adicionar um `Button` ghost com ícone de funil (Phosphor `FunnelSimple`). Quando há filtro ativo, mostrar um dot verde no canto do ícone.
   - Filtrar `threads` antes de renderizar: se `endpointFilter !== 'all'`, manter só threads cujo `endpointMap[thread.id] === endpointFilter`.

2. **Novo componente `src/components/messages/EndpointFilterDialog.tsx`**
   - `Dialog` shadcn com `RadioGroup`:
     - "Todos os números" (padrão)
     - Uma opção por endpoint da org, mostrando: nome amigável + número formatado + sufixo `…NNNN` (mesma lógica do `EndpointBadge`).
   - Rodapé: "Limpar" (volta para `all`) e "Aplicar".
   - Props: `open`, `onOpenChange`, `endpoints`, `value`, `onChange`.

## Detalhes visuais

- Botão de filtro segue o estilo dos vizinhos (mesma altura, ghost, ícone 16px, tokens semânticos — sem cores hardcoded).
- Quando filtro ativo, o contador "47" reflete o total filtrado (mantém UX consistente com a busca).
- Se a org tiver só 1 endpoint, o botão fica oculto (nada para filtrar).

## Fora do escopo

- Filtrar por status do número, por agente, ou múltipla seleção.
- Mobile (`MobileMessagesList`).
- Página `/inbox` (v2) — fica para depois se você quiser.
