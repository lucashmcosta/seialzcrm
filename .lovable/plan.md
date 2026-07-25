## Contexto

Você quer que os 42 leads enviados esta semana pelo webhook da sua LP (anúncio **"1 - Demissao"**, `ad_id = 120251293733850592`) apareçam corretamente atribuídos à campanha no Seialz — hoje eles caíram no CRM como contatos+oportunidades, mas provavelmente sem `contacts.marketing_campaign_id` preenchido, então não aparecem no relatório de performance do ad.

Identificação confirmada:
- `marketing_campaigns.id` = `b3c0e190-66ab-4cbb-94be-7c8dffa9dc7c`
- `ad_id` = `120251293733850592`
- `ad_name` = `1 - Demissao`
- `campaign_name` = `LEADS > LP`
- `organization_id` = `40ae935c-...` (Central Trabalhista)
- criado em 2026-07-14

## O que vai ser feito (somente dados, sem código)

1. **Descoberta read-only** dos 42 telefones da sua lista dentro da Central Trabalhista:
   - Normalizar cada número no formato `phone_normalized` (E.164 sem `+`, tratando o 9º dígito BR).
   - Localizar em `contacts` o registro correspondente (`organization_id = 40ae935c...`, `deleted_at IS NULL`).
   - Anexar `opportunity_id` (mais recente não deletada) e `status` atual.
   - Anotar quais contatos já estão com `marketing_campaign_id` correto, quais estão com outra campanha, e quais estão nulos.

2. **Relatório antes/depois** (tabela consolidada):
   - `# | enviado_sp | nome_lista | telefone | contact_id | opp_id | opp_status | marketing_campaign_id atual | ação`
   - Ações possíveis por linha:
     - `set`: preencher `marketing_campaign_id` (estava nulo)
     - `overwrite?`: já tem outra campanha — **não sobrescreve** sem seu OK explícito
     - `keep`: já está correto
     - `missing`: contato não encontrado no CRM (provavelmente parte dos "missing phone")

3. **Backfill controlado** (INSERT/UPDATE — em modo build):
   - `UPDATE contacts SET marketing_campaign_id = 'b3c0e190-…' WHERE id IN (…lista de contact_ids da ação `set`) AND organization_id = '40ae935c-…' AND marketing_campaign_id IS NULL;`
   - Restrito a `organization_id` da Central Trabalhista.
   - Restrito a `marketing_campaign_id IS NULL` no `WHERE` (guarda de segurança contra sobrescrever).
   - Nenhuma alteração em `opportunities`, `message_threads` ou `activities` — só o link comercial no `contacts`.

4. **Validação pós-backfill**:
   - Contar `contacts` com `marketing_campaign_id = 'b3c0e190-…'` antes e depois.
   - Rodar a mesma consulta que a tela `useAdLeads` / `useAdOpportunities` usa (`marketing_campaign_id = adId`) para confirmar que os 42 aparecem no dashboard do ad.
   - Listar as oportunidades resultantes (won/open/lost) já atribuídas ao ad.

## Fora do escopo (não vou mexer nisso agora)

- Alterar `webhook` da LP / lógica de captura CTWA / regras de atribuição futuras.
- Backfill de outros anúncios ou de leads fora dos 42 da sua lista.
- Recalcular `marketing_campaign_insights_daily` / spend / CPA.
- Sobrescrever `marketing_campaign_id` já preenchido com outro valor (só faço se você autorizar caso a caso).
- Investigação profunda dos "missing phone" (posso fazer em seguida, se quiser).

## Entradas necessárias de você

Preciso da lista completa dos **42 telefones** (ou dos `opportunity_id` que o webhook devolveu, se preferir bater por ID em vez de telefone). Sem isso, o backfill não tem como ser 1‑a‑1 seguro. Se você preferir, também aceita CSV colado no chat.

## Classificação

Ação de dados pontual, **reversível** (dá pra despreencher rodando `UPDATE ... SET marketing_campaign_id = NULL WHERE id IN (...)` com a lista salva).
