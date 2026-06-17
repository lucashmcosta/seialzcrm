Aumentar a largura do `IntegrationDetailDialog`.

**Arquivo:** `src/components/settings/IntegrationDetailDialog.tsx` (linha 638)

**Mudança:** `max-w-md` → `max-w-2xl` no `DialogContent`. Mantém `max-h-[80vh] overflow-y-auto`.

Isso resolve o corte do número, do badge "Conectado", do status dos webhooks e da seção de Números adicionais.