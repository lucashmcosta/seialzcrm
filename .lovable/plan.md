## Phase 5 — Wizard de `stage_mapping` + Validação de `opportunity.stage_changed`

### Objetivo
Permitir mapear visualmente os estágios do CRM ↔ status do Kommo e validar que mover um card no kanban dispara PATCH correto no Kommo.

---

### Parte 1 — Wizard de Stage Mapping (UI)

**Onde:** nova sub-aba "Mapeamento de Estágios" dentro de `KommoOutboundTab.tsx` (já criado na Phase 4), abaixo do toggle de outbound.

**Comportamento:**
1. Buscar `pipeline_stages` da org (internos do CRM) agrupados por `pipeline_id`.
2. Buscar pipelines/statuses do Kommo via nova edge function `kommo-list-pipelines` (GET `/api/v4/leads/pipelines` usando o `access_token` armazenado em `config_values`).
3. Renderizar tabela: cada linha = stage interno; coluna direita = `<Select>` com os statuses do Kommo (filtrados pelo pipeline correspondente).
4. Botão "Salvar" persiste em `integrations.config_values.stage_mapping` no formato:
   ```json
   { "stage_mapping": { "<internal_stage_id>": { "kommo_pipeline_id": 123, "kommo_status_id": 456 } } }
   ```
5. Indicador visual de stages ainda não mapeados (badge "Não mapeado").

**Backend:**
- Nova edge function `kommo-list-pipelines` (read-only, usa `subdomain` + `access_token` da integração da org selecionada).
- Reutilizar o handler existente de Kommo para PATCH (já lê `config_values.stage_mapping` no `kommo.ts`).

---

### Parte 2 — Validação `opportunity.stage_changed` end-to-end

**Pré-requisito:** Phase 1-4 já em produção (trigger emite evento, worker processa, loop-guard ativo).

**Roteiro de teste manual (Blueviza):**
1. Configurar `stage_mapping` via wizard pra pelo menos 2 stages.
2. Mover 1 card no kanban do CRM de stage A → stage B.
3. Verificar:
   - `integration_jobs` recebeu nova linha `event='opportunity.stage_changed'`, `status='pending'`.
   - Worker processou (`status='success'`, `last_http_status=200`).
   - Card no Kommo mudou de status (verificação manual no Kommo).
4. Caso falhe: usar a aba Outbound (Phase 4) pra inspecionar payload + response e reprocessar.

**Sem código novo nessa parte** — só execução do teste e correções pontuais se aparecerem.

---

### Detalhes técnicos

- **Edge function `kommo-list-pipelines`**: aceita `{ organization_id }`, valida que o usuário é admin da org via `current_user_id()`, faz GET no Kommo, retorna `[{ id, name, statuses: [{id, name, color}] }]`.
- **Persistência do mapping**: usar `update integrations set config_values = config_values || jsonb_build_object('stage_mapping', ...) where id = $1` (não destrói outras chaves).
- **Migration**: nenhuma necessária (`config_values` já é jsonb).

---

### Fora de escopo
- Replicar pra outras orgs (Campoar etc.) — só Blueviza.
- Mapeamento reverso (Kommo → CRM) — fluxo é unidirecional.
- Wizard pra mapear pipelines inteiros — só stages dentro de um pipeline já configurado.
