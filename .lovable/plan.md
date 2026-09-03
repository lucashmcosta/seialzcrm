# Sentry SEIALZ-1Q (chunk stale) — conclusão e ação mínima

## O que já tenho (não preciso de mais nada)

A própria captura responde às duas perguntas que faltavam:

- **Last seen:** 12 dias atrás, release `ae48a182bd47`
- **First seen:** ~1 mês atrás, release `0fcae69ea8b6`
- 8 eventos, **0 usuários afetados nos últimos 90 dias**, `handled: yes`

Ou seja: não é recorrência nova — é a mesma issue antiga acumulando eventos residuais, sem novos eventos há 12 dias.

## Por que ainda chegam eventos apesar do filtro

O filtro de stale-chunk existe em `src/instrument.ts` (`beforeSend` derruba
"failed to fetch dynamically imported module"). Ele só roda no bundle que a
aba carregou. Uma aba antiga, aberta antes do deploy, roda a versão antiga do
`instrument.ts` — logo o evento é enviado pelo código velho, sem o filtro. Por
definição esses eventos continuam pingando por alguns dias após cada deploy e
depois param. É exatamente o padrão observado (8 eventos, decrescente, 0
usuários, último há 12 dias).

O app já recupera: `retryImport` + guardas globais em `src/main.tsx` +
escalonamento para hard refresh na segunda falha da sessão.

## Ação mínima proposta

1. **No Sentry (sem código):** arquivar/resolver a issue SEIALZ-1Q e criar um
   *Inbound Filter* / regra de descarte server-side por mensagem
   ("failed to fetch dynamically imported module", "loading chunk",
   "importing a module script failed"). Isso pega também os eventos vindos de
   bundles antigos, que o `beforeSend` nunca vai alcançar.
2. **No repositório (opcional, 1 linha de doc):** registrar essa conclusão em
   `docs/operations/drift/` para não reabrir a investigação na próxima vez.

Nenhuma mudança em código de aplicação, build, RPC, RLS ou infraestrutura é
necessária — a mitigação já está no lugar e não há usuário impactado.

## Decisão que preciso de você

Se preferir, eu aplico apenas o item 2 (documentação). O item 1 é feito na UI
do Sentry, que eu não acesso.
