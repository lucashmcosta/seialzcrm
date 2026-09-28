# SuvSign V2 — vincular modelos da SuvSign a Tipos de documento

Decisão: guardar os vínculos em **tabela própria** (não usar a tabela genérica de integrações).

## O que o usuário vai ver
Na aba **V2 — Signing Engine**, nova seção **"Tipos de documento dos modelos"**: lista os modelos da conta SuvSign e, ao lado de cada um, um seletor com os tipos habilitados na organização (separados em "do contato" / "da oportunidade"), mais "Sem tipo". Salva ao escolher. Só quem gerencia integrações edita.

## Efeito no documento assinado
- Modelo com tipo: o PDF assinado entra com esse tipo, no contato ou na oportunidade conforme o tipo — passa a contar em "Documentos exigidos para fechar".
- Modelo sem tipo: igual a hoje (contato, sem tipo).
- Envios antigos não são reprocessados.

## Fora do escopo
V1, templates, renderer, snapshot, prévia, envio, SuvSign.

## Detalhes técnicos
1. Migration: `suvsign_v2_template_document_types` (`organization_id`, `template_id`, `template_name`, `document_type_id`, `created_by/updated_by` → `users`, timestamps, unique `(organization_id, template_id)`); GRANT `authenticated`/`service_role`; RLS leitura `organization_id = ANY(current_user_org_ids())`, escrita `can_manage_integrations_in_org`; trigger valida tipo global ou da mesma org e atualiza `updated_at`.
2. `signature-requests`: nova ação `list_templates_admin({organization_id})` com `canManage`, mesmo proxy do `list_templates` (o atual exige oportunidade). Publicar explicitamente.
3. UI: novo `SuvSignV2TemplateTypesCard` abaixo do `SuvSignV2CredentialsCard` (este sem alterações), tipos via `useDocumentCatalog` (só habilitados).
4. Webhook `storePdf`: `document_id` → `provider_documents[].ref` → `snapshot.documents[].template_id` → vínculo; grava `document_type_id` e usa `entity_type`/`entity_id` conforme `owner_type` (oportunidade → `r.opportunity_id`). Sem vínculo → caminho atual. Publicar explicitamente.
5. Documentar em `docs/integrations/suvsign-v2.md`.
