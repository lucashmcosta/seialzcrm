## Phase 3 — Validação E2E + loop-guard no kommo-migrate

### Pré-condições já verificadas
- Blueviza (`blueviza.kommo.com`) tem token Kommo válido
- 10 subscriptions Kommo ativas (5 eventos × 2 orgs)
- 11.938 contatos e 4.907 oportunidades importados (com `source='kommo'` + `source_external_id`)
- `stage_mapping` está vazio em ambas as orgs → `opportunity.stage_changed` fica fora do teste por enquanto

### O que vou fazer

**1. Loop-guard no `kommo-migrate`**
Editar `supabase/functions/kommo-migrate/index.ts` pra rodar `SET LOCAL app.skip_event_emit = 'true'` antes dos INSERT/UPDATE de contatos e oportunidades. Sem isso, qualquer re-import dispara dezenas de milhares de jobs outbound em loop.

**2. Teste E2E controlado na Blueviza**
- Selecionar 1 oportunidade Blueviza com `source='kommo'` e `source_external_id` setado (a mais recente, pra minimizar impacto)
- Salvar título original
- UPDATE: anexar ` [sync test ${timestamp}]` ao título
- Aguardar até 60s pro cron `integration-worker` rodar
- Verificar:
  - `integration_events` recebeu evento `opportunity.updated`
  - `integration_jobs` virou `success` (HTTP 200)
  - `integration_audit_logs` mostra a chamada PATCH
  - Confirmar via API Kommo (`GET /api/v4/leads/{id}`) que o título foi atualizado lá
- **Reverter**: UPDATE pro título original com loop-guard ativo (`SET LOCAL app.skip_event_emit = 'true'`) pra não disparar segundo job

**3. Reportar**
Mando: ID da opp testada, jobs gerados, payload enviado, resposta da Kommo, e screenshot/JSON do lead atualizado.

### O que NÃO faço nesta fase
- Teste de criação (POST) — pula pra evitar criar lead órfão na Kommo
- `stage_changed` — sem `stage_mapping` configurado, daria erro Permanent
- UI admin (toggle + lista de jobs) — fica pra próximo passo depois do backend validado

### Próximo passo (Phase 3.1) se este teste passar
- Configurar `stage_mapping` da Blueviza (via wizard ou dialog admin novo) e validar `stage_changed`
- UI admin com toggle de outbound + lista dos últimos 20 jobs Kommo
- Replicar pra Campoar