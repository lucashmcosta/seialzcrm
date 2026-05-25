## Atribuição conservadora de campanhas de marketing

Observação: a migração SQL com `fn_resolve_marketing_campaign_id`, `marketing_attribution_ambiguities`, `fn_log_marketing_attribution_attempt`, `fn_marketing_attribution_dryrun` e `fn_marketing_attribution_top_conflicts` já foi aplicada (multi-tenant, single-match-only, sem heurística). Não muda RPC de performance nem cria frontend.

### Próximos passos a executar

1. **Integrar no `lead-webhook`**
   - Capturar também `utm_content` e `utm_term` do `rawPayload` / mapping e gravar no `contacts`.
   - Após criar/reutilizar o contato, chamar `fn_log_marketing_attribution_attempt(org_id, contact_id)` via service role.
   - Não bloqueia a resposta — log se falhar.
   - Escopo: apenas `supabase/functions/lead-webhook/index.ts`. `meta-lead-ads-process-lead` continua intocado.

2. **Adicionar coluna `utm_content`/`utm_term` em `contacts`** se ainda não existir (verificar; se faltar, migração curta).

3. **Dry-run multi-tenant (sem alterar dados)**
   - Rodar `SELECT * FROM fn_marketing_attribution_dryrun();` e `SELECT * FROM fn_marketing_attribution_top_conflicts(NULL, 50);`
   - Entregar relatório em `/mnt/documents/marketing_attribution_dryrun.csv` com: org, elegíveis, match único, ambíguos, sem match.
   - Entregar `/mnt/documents/marketing_attribution_top_conflicts.csv` com top conflitos por org (utm_*, contatos, candidate_count, ad_names, adset_names, campaign_names).

4. **Backfill restrito à Viagi** (após você revisar os CSVs)
   - Migração:
     ```sql
     WITH cand AS (
       SELECT id FROM contacts
       WHERE organization_id = 'b246ef6f-6242-4011-a112-6d8783d2896a'
         AND deleted_at IS NULL
         AND marketing_campaign_id IS NULL
         AND (utm_campaign IS NOT NULL OR utm_content IS NOT NULL OR utm_term IS NOT NULL)
     )
     SELECT fn_log_marketing_attribution_attempt(
       'b246ef6f-6242-4011-a112-6d8783d2896a'::uuid, id
     ) FROM cand;
     ```
   - Resultado esperado dado o estudo anterior: praticamente tudo cai como `ambiguous` e fica registrado em `marketing_attribution_ambiguities` para revisão manual.
   - Entregar contagem final: assigned / ambiguous / no_match / already_assigned.

5. **Backfill multi-tenant — NÃO executar agora.** Fica condicionado à sua aprovação após revisar o dry-run e o resultado da Viagi.

### Fora de escopo (confirmado)
- Sem mudança em `get_marketing_ad_performance`.
- Sem mudança em `meta-lead-ads-process-lead`.
- Sem frontend / sem tela de revisão de ambiguidades.
- Sem heurística automática de desempate.
- Sem mudança em Outbox / Nammux.