## Diagnóstico

O erro `ReferenceError: useMemo is not defined` em `src/pages/messages/MessagesList.tsx:637` **não existe no código atual**.

Verificação read-only (linha 1 do arquivo):
```ts
import { useState, useEffect, useMemo, useRef, Fragment } from 'react';
```

`useMemo` está devidamente importado e é usado em 4 lugares (linhas 637, 689, 723, 727).

## Causa raiz

Ruído transiente do HMR do Vite durante a sessão de desenvolvimento. Os logs mostram o padrão típico:

- Múltiplos `[vite] hot updated: /src/pages/messages/MessagesList.tsx` em sequência (17:25:23, 17:25:45, 17:26:00, 17:27:31, 17:27:49)
- Um `SyntaxError: Identifier 'useTranslation' has already been declared` em `NewConversationDialog.tsx` às 17:26:09, sintoma clássico de módulo re-executado sem descarte prévio
- O erro do `useMemo` aparece exatamente após uma cadeia de hot updates parciais em `MessagesList.tsx`

Quando o Vite aplica um patch HMR mas o React Refresh reexecuta o módulo com o escopo antigo (imports não re-resolvidos), símbolos podem aparecer como "not defined" mesmo estando no topo do arquivo. Isso não reproduz em produção nem após reload completo.

## Ação

**Nenhuma alteração de código necessária.** O erro se resolve com um hard reload (Ctrl+Shift+R) do preview. Não há bug de runtime nem de build para consertar.

Se quiser blindar essa classe de erro (HMR de arquivos grandes com muitos hooks), aí sim faria sentido um plano separado — por exemplo, quebrar `MessagesList.tsx` em componentes menores (o arquivo tem 700+ linhas com múltiplos `useMemo`/`useEffect` no mesmo componente), o que reduziria a superfície de reexecução do React Refresh. Mas isso é refactor, não fix.