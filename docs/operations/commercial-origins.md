# Origens comerciais

Camada adicional ao marketing. Nenhuma rotina nova escreve em `contacts.source`, UTMs, GCLID, CTWA, `marketing_campaign_id`, campos legados de atribuição de oportunidades, ambiguidades ou conversões. Os relatórios de marketing e o parser legado da Central Trabalhista permanecem inalterados.

## Entrega e ativação

1. Aplicar `20260925120000_commercial_attribution.sql`  , `20260925121000_commercial_queries.sql` e `20260928130000_commercial_query_access_once.sql` pelo processo de migrações do ambiente.
2. Publicar os webhooks `meta-whatsapp-webhook`, `twilio-whatsapp-webhook`, `meta-lead-ads-process-lead` e `lead-webhook`, junto com `_shared/commercial-origin.ts`. Publicar o frontend.
3. Acessar **Configurações → Origens comerciais** na organização desejada e ativar. A migração não ativa tenants nem inventa regras.
4. Na Central Trabalhista, inspecionar somente em leitura os sinais reais da campanha Google e o texto atual do botão. Cadastrar o texto efetivamente usado como regra, escolher Google Ads e, se comprovada, a campanha correspondente. Usar o simulador antes de ativar a regra. Repetir os testes em uma segunda organização.
5. Para históricos, escolher um período, **Preparar histórico**, **Ver prévia** e **Aplicar esta página**. A preparação copia evidências para tabelas comerciais; não atribui origens. A prévia é somente leitura. A aplicação limita-se a destinos desconhecidos e revalida regras e revisões.

As novas rotas são `/settings/commercial-origins` e `/commercial/origins`. Listas e Kanban usam RPCs comerciais somente quando a funcionalidade está ativa. Os filtros e relatórios respeitam a organização e os registros visíveis ao usuário.

## Critérios de atribuição

- Contato: origem da primeira entrada comprovada. Oportunidade: entrada que a gerou, vinculada explicitamente pelo processamento ou selecionada manualmente.
- WhatsApp: os webhooks gravam `metadata.commercial_entry` com a oportunidade criada naquele processamento e o indicador de contato recém-criado. Não procuram oportunidades por proximidade de horários.
- CTWA/GCLID da entrada têm prioridade sobre texto. Campos antigos do contato não são usados como evidência de uma nova oportunidade. Evidências diretas contraditórias ficam pendentes.
- Texto: igualdade ou trecho literal após normalização NFC, caixa e espaços; mantém acentos, pontuação e emojis. Regras exatas precedem `contém`; depois, menor prioridade numérica. Empates contraditórios não atribuem.
- Textos de mensagens posteriores, áudio, placeholders e mensagens enviadas pela equipe não adquirem oportunidades. Correspondências sem vínculo verificável permanecem para revisão.
- Correções são comerciais, auditadas, e protegidas de sobrescrita automática. A ação de criação manual de oportunidade pode escolher origem, campanha e evento.
- Google → site → WhatsApp, sem referência vinculável, continua sem identificação automática garantida. Uma frase compartilhada por canais diferentes não comprova aquisição Google.

## Histórico e limites

O importador lê mensagens persistidas e evidências armazenadas na própria oportunidade. Nunca copia a campanha atual do contato para suas oportunidades antigas. Mensagens antigas sem `commercial_entry` podem sugerir regras, mas não comprovam a entrada de uma oportunidade. O operador pode revisar o evento e fazer correção auditada no detalhe. A origem inicial de contatos antigos não é reconstruída por suposição.

Eventos com falha de classificação mantêm `process_error` e podem ser reavaliados pela prévia. Falhas na captura de mensagem não bloqueiam o webhook; a mensagem persistida permite recuperação pelo importador. Falhas de transporte do RPC de formulários são registradas no log `[commercial-origin]`; quando não existe evidência persistida suficiente, a correção/reexecução da origem precisa ser feita pelo operador, sem inventar um vínculo.

O `lead-webhook` aceita opcionalmente `commercial_event_id` para deduplicar a captura comercial de uma entrada do emissor (escopo organização + chave de API). Isso não altera a política legada de criação de leads ou torna a operação inteira idempotente. Sem identificador, cada requisição é uma entrada distinta. Meta Lead Ads usa o ID do lead; WhatsApp usa o ID persistido da mensagem.

Desativar a camada em configurações suspende captura e consultas comerciais no CRM. Dados e histórico são preservados; marketing continua funcionando. Correções de origem não fazem alterações retroativas nas campanhas de anúncios.

## Validação local

Requer PostgreSQL descartável, UTF-8, extensão `unaccent` e capacidade de criar as roles de teste. **Nunca executar o fixture em banco existente de cliente.**

```sh
psql -d BANCO_DESCARTAVEL -v ON_ERROR_STOP=1 -f supabase/tests/commercial_fixture.sql -f supabase/tests/commercial_attribution.sql
deno test supabase/functions/_shared/commercial-origin.test.ts tests/regional.test.ts
deno check supabase/functions/meta-whatsapp-webhook/index.ts supabase/functions/twilio-whatsapp-webhook/index.ts supabase/functions/lead-webhook/index.ts supabase/functions/meta-lead-ads-process-lead/index.ts
npx tsc --noEmit -p tsconfig.app.json
env -u SENTRY_AUTH_TOKEN npm run build
```

O fixture cria somente o contrato mínimo das tabelas legadas; não substitui homologação com o schema completo. A suíte cobre isolamento, permissões por responsável, precedência, conflitos, normalização, ausência de alterações legadas, paginação, moeda, captura por trigger, mídia, reprocessamento e proteção de correções. A validação publicada e seus limites estão em [Publicação e validação](commercial-origins-published-validation.md). O envio de conversões às plataformas permanece fora do escopo da suíte comercial.

Monitorar, por organização: eventos com `process_error`, entradas sem vínculo, conflitos, percentual sem origem, e latência dos webhooks. O painel comercial não mede custos, ROAS ou conciliação das plataformas.

A suíte `supabase/tests/commercial_published_transaction.sql` complementa o fixture mínimo: exige o schema completo e duas identidades existentes, cria somente dados sintéticos em transação e termina com `ROLLBACK`. Não executar o fixture mínimo junto dela. Revisar triggers e integrações do ambiente antes de executá-la; a versão publicada foi validada com esse cuidado.
