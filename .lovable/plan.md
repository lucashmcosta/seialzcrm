## Diagnóstico

O erro `ReferenceError: lastInboundTime is not defined` **não existe no código atual** de `src/pages/messages/MessagesList.tsx`.

Verificação read-only:
- `rg lastInboundTime src/pages/messages/MessagesList.tsx` → 0 ocorrências
- Linha 722 hoje é apenas um comentário (`// Derived numbers for interpolation...`), seguida pelos `useMemo` de `commercialEndpointNumber` e `serviceEndpointNumber`. Nenhum símbolo `lastInboundTime` no arquivo.

## Causa raiz

Ruído transiente de HMR do Vite, mesmo padrão do erro anterior (`useMemo is not defined`). Os logs confirmam:

- Às 19:11:21.512 chega `[vite] hot updated: /src/pages/messages/MessagesList.tsx`
- Menos de 1s depois (19:11:22.168) o Sentry captura `ReferenceError: lastInboundTime is not defined`
- A stack aponta para `performReactRefresh` / `scheduleRefresh` — é o React Refresh reexecutando um módulo com escopo antigo referenciando uma variável que já foi removida numa versão anterior do arquivo

`lastInboundTime` provavelmente foi uma variável usada em iteração anterior do componente (contexto de janela de 24h) e removida quando o roteamento passou a usar `serviceWindow.isOpen` / `messaging_lines.active_endpoint_id`. O bundle em memória do dev server ficou temporariamente inconsistente entre patches HMR.

## Ação

**Nenhuma alteração de código necessária.** O erro se resolve com um hard reload (Ctrl+Shift+R). Não reproduz em produção nem após reload completo.

Se o padrão continuar recorrente (já são dois erros idênticos de HMR neste mesmo arquivo em turnos consecutivos), a mitigação real seria quebrar `MessagesList.tsx` (2721 linhas hoje) em componentes menores para reduzir a superfície do React Refresh — mas isso é refactor, não fix de bug.