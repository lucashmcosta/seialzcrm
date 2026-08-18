# Auditoria bloqueante do tempo relativo em `/commercial`

Nenhuma correção de layout será feita até a causa ser comprovada.

## Evidência já confirmada

Thread escolhida no banco vivo:

```text
THREAD_ID=8c2c477c-8fbd-4b8c-9f66-f7a706c6faff
CONTACT_NAME=Celso
updated_at=2026-08-18 21:15:57.151107+00
formatRelativeTime(updated_at, pt-BR)=1 min atrás (às 21:17:19 UTC)
```

O módulo efetivamente servido por `/commercial` contém o horário. A rota monta `MessagesList`; no viewport desktop, `MessagesList` retorna `DesktopMessagesList`. Quando a lista terminou de carregar e possui itens, cada thread passa pelo mesmo `ChatListItem`.

Dentro de `ChatListItem` há somente um retorno de item (além do guard `if (!value) return null`). Nome e horário estão no mesmo `return` e na mesma linha JSX:

```tsx
<div className="flex items-center justify-between gap-2">
  <div className="flex items-center gap-1.5 min-w-0 flex-1">
    <span className="font-semibold text-sm text-foreground truncate">
      {value.contact_name}
    </span>
    <RouteBadge ... />
    {value.unread && <span ... />}
  </div>
  <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground leading-5">
    {formatRelativeTime(value.updated_at, locale)}
  </span>
</div>
```

`selected` altera apenas a classe de fundo; `unread` controla somente o ponto; preview e route badge não condicionam o horário. Mobile usa outro componente, e loading/error/empty substituem a lista inteira — portanto não explicam um item cujo nome está visível.

## Prova temporária no componente final

1. No preview autenticado, substituir temporariamente apenas o conteúdo do `span` do horário por `TESTE-HORA`, sem alterar classes, largura, resize, overflow, `min-w-0`, dados ou backend.
2. Recarregar `/commercial`, localizar a thread “Celso” pelo item final renderizado e registrar:
   - presença do literal no DOM e na tela;
   - texto, dimensões e computed state do `span`;
   - ancestral imediato e branch desktop efetivo.
3. Restaurar imediatamente `formatRelativeTime(value.updated_at, locale)` e confirmar que `TESTE-HORA` não permanece no fonte nem no módulo servido.
4. Se o literal aparecer, capturar o valor real de `value.updated_at`, `locale` e o retorno do formatador no mesmo render. Se não aparecer, rastrear a divergência entre o módulo servido e a árvore montada antes de propor qualquer mudança.
5. Somente após essa prova, apresentar `TIME_LITERAL_RENDERED`, `FORMAT_RESULT`, `JSX_BRANCH`, `ROOT_CAUSE` e `MINIMAL_FIX`; não implementar a correção sem nova aprovação.

## Limites e conformidade

- Módulo afetado: Messages/Comercial, somente auditoria de frontend.
- Documentação consultada: `docs/README.md`, `docs/STATUS.md`, `docs/modules/messages/README.md`, ADR-0009, conflitos e drift aplicável.
- Banco: apenas leitura da thread escolhida.
- Sem alterações em RLS, Edge Functions, integrações, multi-tenancy, query, realtime ou backend.
- O navegador automatizado isolado usa Supabase externo não gerenciado e foi redirecionado para `/auth/signin`; por isso a prova literal no DOM autenticado ainda é a etapa bloqueante, e nenhum resultado será inventado.