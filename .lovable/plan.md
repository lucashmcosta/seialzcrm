## Diagnóstico

O erro capturado pelo Sentry:

```
TypeError: Cannot read properties of undefined (reading 'default')
    at _re  ← React.lazy.mountLazyComponent
    at ProtectedRoute (App.tsx:219)
```

acontece **imediatamente após navegar `/dashboard → /opportunities`**. Nos breadcrumbs não há nenhum "Failed to fetch dynamically imported module" antecedendo — ou seja, o `import()` da rota **resolveu**, porém o objeto do módulo entregue ao `React.lazy` está `undefined` (ou sem a chave `default`). O `mountLazyComponent` do React lê `payload._result.default` e explode com exatamente essa mensagem.

Isto **não é** um stale-chunk clássico (não bate com nenhum matcher em `isStaleChunkError` e não vem de `retryImport`), então nossa infra atual de reload silencioso não intercepta. É uma variante nova: o chunk chega, mas seu payload está corrompido/vazio — típico de resposta HTML servida com MIME `application/javascript` (o Vercel devolvendo o index.html quando o hash antigo já não existe no CDN), ou de circular import que retorna partial namespace.

Não temos evidência de qual dos ~60 `lazy()` foi o culpado neste evento — o `_re` minificado esconde isso. A hipótese mais provável é `OpportunitiesKanban` (rota destino), mas qualquer lazy filho no boot da rota pode ter sido o real.

## Objetivo

Fechar essa lacuna sem tocar em produto: qualquer `lazy()` cujo módulo resolva como `undefined` ou sem `default` deve ser tratado como stale-chunk — dispara `reloadForChunkRecovery()` e mantém suspenso, em vez de estourar no ErrorBoundary. Além disso, precisamos identificar em produção **qual** módulo falhou.

## Plano

1. **Extrair um helper `lazyWithRetry` em `src/App.tsx`** que envolve o padrão hoje repetido em cada `lazy(() => retryImport(() => import(...)))`. Ele:
   - recebe o `importer` e um `name` (string estática, ex.: `"OpportunitiesKanban"`) só para telemetria;
   - após `retryImport(importer)`, valida se `mod && typeof mod === "object" && "default" in mod && mod.default !== undefined`;
   - se **não** validar: envia um breadcrumb Sentry com o `name` e o formato do módulo recebido, chama `reloadForChunkRecovery()` e retorna `new Promise(() => {})` (mesmo caminho que já usamos para stale chunks). Nada chega ao ErrorBoundary.
   - se validar: retorna o módulo normalmente.
   - Para os lazies "named export" (ex.: `.then(m => ({ default: m.AdminProtectedRoute }))`), aceitar uma segunda variante que recebe o nome do export e faz a mesma validação sobre `m[exportName]`.

2. **Ampliar `isStaleChunkError`** para reconhecer também `"Cannot read properties of undefined (reading 'default')"` e `"undefined is not an object (evaluating 'default')"` (Safari). Isso protege caminhos onde o React já lançou antes de conseguirmos interceptar via helper (edge cases de Suspense fora do lazy wrapper). O `SentryFallback` e os guards em `main.tsx` já usam esse matcher, então basta estender a string.

3. **Migrar os `lazy()` de `src/App.tsx` para o helper.** Troca mecânica linha-a-linha (mesmo importer, apenas envolvido). Sem mudar rotas, ordem, `Suspense boundaries` ou lógica de auth. Nenhum outro arquivo é tocado.

4. **Observabilidade** — adicionar um `Sentry.addBreadcrumb({ category: "lazy", level: "warning", message: "module_missing_default", data: { name, keys } })` antes do reload, para que o próximo evento diga exatamente qual chunk chegou vazio. Sem novo transporte, sem novo serviço.

## Fora de escopo

- Nada de mudança em rotas, providers, contextos, banco, edge functions ou UI de produto.
- Não vamos alterar a configuração do Vercel nem headers do CDN neste passo — o objetivo é blindar o cliente. Se após a instrumentação o breadcrumb mostrar que sempre é o mesmo chunk, aí discutimos cache/headers como passo 2.
- Não vamos filtrar esses erros no Sentry (silenciar) — o helper já os transforma em reload silencioso, então eles somem naturalmente do fluxo do ErrorBoundary; o breadcrumb fica para diagnóstico.

## Detalhes técnicos

Assinatura pretendida:

```ts
function lazyWithRetry<T extends ComponentType<any>>(
  name: string,
  importer: () => Promise<{ default: T }>,
): LazyExoticComponent<T>;

function lazyWithRetry<T extends ComponentType<any>>(
  name: string,
  importer: () => Promise<Record<string, any>>,
  exportName: string,
): LazyExoticComponent<T>;
```

Local: `src/App.tsx` (mesma unidade dos `lazy()` atuais, evita novo arquivo). `isStaleChunkError` já vive lá e é exportado, então só ganha mais entradas na lista.

Nenhuma migration, nenhuma edge function, nenhuma dependência nova.