# Blocos de contexto como contêineres visuais (timeline Comercial)

Transformar os blocos já calculados por `computeContextBlocks()` em cartões visuais explícitos, no estilo Kommo. Somente apresentação — nenhuma regra de agrupamento, dado, backend ou módulo Atendimento/Mobile é alterado.

## O que muda na tela

- Cada contexto (mesmo participante, operador/IA, número e provider) passa a ser um cartão com borda sutil, raio, padding interno e espaçamento entre cartões.
- O cabeçalho do contexto passa a ficar dentro do cartão: nome (Cliente / Operador / Assistente IA) e, abaixo, `WhatsApp • número`, com o provider só quando não for o padrão.
- Provider sempre em rótulo amigável (Meta, Twilio, Evolution) — nunca `meta_cloud_api` etc.
- Bolhas seguem com o mesmo alinhamento, sem repetir nome/metadados; horário e status ficam como já estão.
- Separador de data, divisor "Número alterado" e eventos de sistema (migração, transferência) ficam FORA dos cartões, centralizados, e fecham o cartão anterior; o próximo contexto abre um cartão novo.
- Nota interna continua como bloco próprio, fora dos cartões de contexto.

## Como será feito (técnico)

Arquivo único: `src/pages/messages/MessagesList.tsx` (`DesktopMessagesList`).

1. Trocar o `chatItems.map(...) => <Fragment>` por duas etapas:
   - fase 1: manter o cálculo atual de `separator`, `rotationSeparator`, `blockHeader` e `renderItem` por item, produzindo uma lista intermediária com `{ blockIndex, kind, separator, rotationSeparator, blockHeader, renderItem }`;
   - fase 2: reduzir essa lista em segmentos: itens `system`/`note` e quaisquer separadores viram elementos soltos; sequências de itens `message` do mesmo `blockIndex` são envolvidas em um `<div>` contêiner.
2. Contêiner com tokens semânticos existentes: `rounded-lg border border-border/60 bg-muted/20 px-3 py-2.5 space-y-1` e `space-y-3` entre segmentos. Sem cores novas, sem hardcode.
3. `blockHeader` deixa de ter `mt-4` e passa a ser a primeira linha interna do contêiner (mantendo alinhamento esquerda/direita conforme direção).
4. Manter `whatsappProviderLabel` para o rótulo do provider e `formatPhoneDisplay` para o número.
5. Não alterar `src/lib/messageGrouping.ts` nem os testes de agrupamento; validar com typecheck e a suíte existente.

## Fora de escopo

Backend, banco, realtime, paginação, resolver, módulo Atendimento e componentes mobile.
