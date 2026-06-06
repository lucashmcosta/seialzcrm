## Contexto

Na Central Trabalhista (org `40ae935c-...`), alguns clientes chegam pelo WhatsApp com a primeira mensagem contendo um marcador de origem no próprio texto, ex:

```
Olá, quero conferir meu acerto rescisório [src:gads|g:Cj0KCQjw...]
```

Esse marcador vem de um link de Click-to-WhatsApp gerado fora do Meta (provavelmente um anúncio Google Ads que envia para `wa.me`), por isso hoje o contato é classificado como **Orgânico** — não há `utm_*`, `gclid`, nem `ad_referral_*` preenchidos.

Variações já observadas no histórico:
- `[src:gads|g:<GCLID>]` → Google Ads (com gclid)
- `[src:direct]` → digitado/colado direto
- Potencialmente `[src:<outro>|...]` no futuro

Volume confirmado nos últimos 90 dias na Central Trabalhista: 2 contatos `gads` (3/jun e 4/jun) e vários `direct`. É um piloto recém-ligado.

## Objetivo

Capturar essa origem **sem depender do frontend** (mensagens entram via Railway/edge functions/webhooks Twilio), preencher os campos de atribuição do contato, e fazer com que o badge "Origem" pare de mostrar Orgânico nesses casos.

Escopo deliberadamente pequeno e temporário: nada de novo dashboard, nada de marketing_campaigns sintética, nada de mexer no Railway.

## Plano

### 1. Migration — trigger em `messages` (parser server-side)

Criar função `public.parse_lead_source_marker_from_message()` + trigger `AFTER INSERT ON public.messages` que:

- Só executa quando `NEW.direction = 'inbound'` e `NEW.content ~ '\[src:[^\]]+\]'`.
- Extrai com regex:
  - `src`: string após `src:` até `|` ou `]`
  - `g` (opcional): GCLID após `g:` até `]`
- Localiza o contato pelo `thread_id` (`message_threads.contact_id`).
- Atualiza `contacts` **apenas se os campos de atribuição estiverem nulos** (não sobrescreve quem já tem Meta/CTWA/UTM):
  - `src=gads`: `utm_source='google'`, `utm_medium='cpc'`, `source='google_ads'`, `gclid=<g>` (quando presente).
  - `src=direct`: `utm_source='direct'`, `utm_medium='none'` (mantém classificação não-paga).
  - Outros valores: grava `utm_source=<src>` cru para não perdermos sinal.
- `SECURITY DEFINER`, `SET search_path = public`, idempotente.
- Escopo: somente Central Trabalhista nesta v1 (`WHERE NEW.organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'`) — pode ser ampliado depois removendo esse filtro.

Backfill no fim da mesma migration: aplicar a mesma lógica aos contatos existentes da Central Trabalhista cujo primeiro inbound contenha `[src:...]` e que ainda estejam sem atribuição.

### 2. Frontend — classificar Google Ads em `src/lib/leadOrigin.ts`

Adicionar variante no tipo `LeadOrigin`:

- `{ kind: 'google_ads'; label: 'Google Ads' }`

Regra de detecção (antes do bloco "Tráfego Pago"):

- Se `contact.gclid` **ou** `utm_source === 'google'` com `utm_medium ∈ ('cpc','ppc','paid')` → `google_ads`.

Cor em `getLeadOriginColor`: usar `'warning'` (mesma família de pago) ou criar nova — proposta: `'warning'` para manter consistência sem inflar paleta.

`LeadOriginBadge` já consome o helper, então herda automaticamente. Nenhuma outra alteração de UI necessária.

### 3. (Opcional, fora desta v1) Sanitização visual do `[src:...]` no balão da mensagem

**Não incluído** neste plano para manter o escopo mínimo e não tocar no pipeline de renderização do WhatsApp. Se quiser, faço numa segunda rodada removendo o trecho `\s*\[src:[^\]]+\]\s*$` apenas no render (sem alterar o conteúdo armazenado).

## Detalhes técnicos

- Trigger é `AFTER INSERT`, não bloqueia a escrita da mensagem; falha silenciosa em caso de erro de parse (try/except no PL/pgSQL).
- Não cria `marketing_campaigns` nem `import_logs` — atribuição fica só no contato.
- Regex em Postgres: `substring(NEW.content from '\[src:([^|\]]+)')` e `substring(NEW.content from '\|g:([^\]]+)\]')`.
- Não altera RLS nem grants (tabelas já existem).
- Reversível: `DROP TRIGGER` + `DROP FUNCTION` e os campos preenchidos podem ser limpos por SQL pontual se necessário.

## Arquivos

- **Nova migration** `supabase/migrations/<timestamp>_parse_lead_source_marker.sql`
- **Edit** `src/lib/leadOrigin.ts` (novo kind `google_ads` + regra + cor)

## Verificação após aplicar

1. Rodar `SELECT id, utm_source, utm_medium, gclid, source FROM contacts WHERE id IN ('7b229631-...','ee156f06-...')` e confirmar preenchimento.
2. Abrir um desses contatos na UI → badge deve mostrar **Google Ads** (warning).
3. Enviar mensagem-teste contendo `[src:gads|g:TESTE123]` (ou simular via insert direto) e ver o contato sendo marcado.
