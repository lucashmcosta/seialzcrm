## Validação E2E parcial — Templates Meta Cloud (opção a)

Escopo aprovado: Etapa 1 + Etapa 2 + Cenários 1, 2, 3, 8. Cenários 4/5/6/7 ficam pendentes por dependência externa (orgs de teste e aprovação manual no Business Manager). Sem mexer em schema, Twilio, Railway, composer, envio ou dispatcher. Não vou ativar/desativar integrações em orgs existentes.

---

### Etapa 1 — Investigação prévia (read-only)

1. `supabase--read_query` em `information_schema.columns` para confirmar que `whatsapp_templates.source` existe (a entrega anterior assumiu que sim). Se não existir, parar e reportar — sem migration.
2. Reler `meta-whatsapp-templates-sync/index.ts` para confirmar que `rejected_reason` **não** está incluído no `fields` da Graph API (é o gap que motiva a Etapa 2).
3. Reler `WhatsAppTemplates.tsx` para localizar exatamente onde o badge de status é renderizado (ponto de extensão para tooltip).
4. `supabase--read_query` em `organization_integrations` filtrando por slug `meta-whatsapp-cloud` para identificar 1 org com Meta ativa, que será usada nos Cenários 1, 2 e 8.

### Etapa 2 — Melhoria UX `rejection_reason` (mudanças cirúrgicas)

Backend:
- `supabase/functions/meta-whatsapp-templates-sync/index.ts`: adicionar `rejected_reason` ao `fields` das duas chamadas `metaWaGet`; persistir explicitamente em `metadata.meta_cloud.rejected_reason` (além do `raw` que já guarda tudo).
- `supabase/functions/meta-whatsapp-templates-create/index.ts`: se Meta responder `status='REJECTED'` na criação, persistir `metadata.meta_cloud.rejected_reason` igualmente.
- Deploy via `supabase--deploy_edge_functions` das duas funções.

Frontend:
- `src/pages/settings/WhatsAppTemplates.tsx`: para `provider='meta_cloud_api'` + `status='rejected'`, envolver o badge "Rejeitado" em `Tooltip` (shadcn já existente) exibindo `metadata.meta_cloud.rejected_reason` ou fallback `"Motivo não informado pela Meta"`. Templates Twilio: **inalterados**.

Sem migration. Sem mexer em outros componentes.

### Etapa 3 — Execução dos cenários permitidos

| # | Cenário | Método de validação |
|---|---------|---------------------|
| 1 | Criar template Meta | Playwright via shell na UI do preview → `/whatsapp/templates/new?provider=meta_cloud_api`, preencher `teste_meta_<ts>`, UTILITY, pt_BR, body com `{{1}}`. Verificar via `supabase--read_query` a linha resultante (`provider`, `source`, `status`, `meta_template_name`, `meta_waba_id`, `metadata.meta_cloud`). Conferir `supabase--edge_function_logs` de `meta-whatsapp-templates-create`. |
| 2 | Sync idempotente | Clicar "Sincronizar Meta" 2x. Conferir `count(*)` por `(provider, organization_integration_id, meta_template_name, language)` permanece 1. Conferir `last_synced_at` avança. |
| 3 | Fluxo Twilio intacto | Criar template Twilio via UI normal. Conferir `twilio_content_sid` preenchido, `provider='twilio'`, badge azul, sem logs em funções Meta. |
| 8 | Rejeição | Tentar criar template com nome inválido (ex.: `Teste-Maiusculo`) para forçar `400` antes da Meta; e um segundo com categoria/body que a Meta provavelmente rejeite. Confirmar: toast amigável, **nenhuma linha** criada em `whatsapp_templates` (sem registro parcial), logs claros. Se algum chegar a status `rejected` via sync, validar badge + tooltip da Etapa 2. |

Cenários **4, 5, 6, 7**: não executados — registrados como pendentes por dependência externa.

### Etapa 4 — Relatório parcial

Tabela final com: passou / corrigido / pendente por dependência externa, listando arquivos tocados na Etapa 2 e qualquer correção emergente da Etapa 3.

---

### Fora de escopo

Schema, Twilio/Railway, composer, envio, dispatcher, delete Meta, edição de templates Meta aprovados, ativar/desativar integrações em orgs existentes.
