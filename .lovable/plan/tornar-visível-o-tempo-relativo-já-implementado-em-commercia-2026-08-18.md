# Tornar visível o tempo relativo já implementado em `/commercial`

## Auditoria objetiva

### Módulo realmente servido

- `/commercial` monta `MessagesList` de `src/pages/messages/MessagesList.tsx`; `/messages` apenas redireciona para `/commercial`.
- O JSX servido pelo Vite contém o `span` do horário, com classes `shrink-0 text-[11px] text-muted-foreground leading-5` e valor `formatRelativeTime(value.updated_at, locale)`.
- O hook mapeia `updated_at` diretamente da RPC para cada `ChatThread`; não há transformação ou fallback nesse campo.

### Thread concreta visível no print

```text
THREAD_ID=739fd677-60be-4594-857b-7e9f8180919b
CONTACT=Jairo
UPDATED_AT=2026-08-18 19:57:13.838142+00
FORMAT_RELATIVE_TIME_RESULT=5 min atrás
```

O resultado foi executado às `2026-08-18T20:02:22Z` com a mesma função e locale `pt-BR` usados no componente.

### Divergência confirmada no HTTP do Vite

O módulo normal que o navegador importa está stale:

```text
/src/pages/messages/MessagesList.tsx
  span do tempo: PRESENTE
  overflow-hidden mais recente no item: AUSENTE

/src/components/messages/LastMessagePreview.tsx
  min-w-0 mais recente no texto do preview: AUSENTE
```

Com bypass da transformação em cache (`?direct=1`), os dois arquivos já contêm as correções mais recentes. Os arquivos têm `Last-Modified: 18 Aug 2026 19:54:32 GMT` e a resposta declara `Cache-Control: no-cache`, mas a transformação padrão mantida pelo processo Vite continua anterior.

### DOM e computed styles

A sessão do preview usa Supabase externo não gerenciado (`external_unmanaged`), portanto não pode ser restaurada no navegador isolado de auditoria. O acesso automatizado a `/commercial` foi redirecionado para `/auth/signin`. Assim, seria incorreto inventar medições do DOM autenticado:

```text
TIME_SPAN_PRESENT_IN_DOM=[INCERTO — rota autenticada indisponível no navegador de auditoria]
TIME_SPAN_TEXT=[INCERTO]
TIME_SPAN_WIDTH_PX=[INCERTO]
TIME_SPAN_DISPLAY=[INCERTO]
TIME_SPAN_VISIBILITY=[INCERTO]
TIME_SPAN_OPACITY=[INCERTO]
PARENT_OVERFLOW=[INCERTO no DOM; módulo carregado ainda não contém o overflow-hidden novo]
```

No CSS-fonte não existe regra customizada que aplique `display:none`, `visibility:hidden`, `opacity:0` ou reposicionamento ao horário. No JSX, o horário é `shrink-0`; a coluna externa é `min-w-0 flex-1`. O bloco à esquerda da linha do nome tem `min-w-0`, mas não `flex-1`; isso não explica sozinho a ausência também em nomes curtos como “Jairo”.

```text
ROOT_CAUSE=transformação stale do módulo mantida pelo processo Vite: o preview não está executando as duas correções que já existem no fonte
```

## Correção mínima

1. Reiniciar uma única vez o processo Vite supervisionado para invalidar a transformação stale, sem editar código.
2. Confirmar via HTTP, no URL normal e sem `?direct=1`, que o item contém `overflow-hidden`, o texto do preview contém `min-w-0` e o `span` do tempo continua recebendo `value.updated_at`.
3. Reabrir `/commercial` e verificar visualmente que o tempo aparece à direita de “Jairo”.
4. Se, e somente se, o módulo atualizado estiver comprovadamente carregado e o horário continuar invisível, repetir a inspeção autenticada do DOM antes de propor qualquer CSS adicional.

## Escopo

- Módulo afetado: Messages/Comercial, somente apresentação.
- Documentação consultada: `docs/README.md`, `docs/STATUS.md`, `docs/modules/messages/README.md`, ADR-0009, conflitos e drift aplicável.
- Banco, RLS, Edge Functions, integrações, multi-tenancy, query, realtime, ordenação e backend: sem alteração.