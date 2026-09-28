# SuvSign V2 — vincular modelos da SuvSign a Tipos de documento

## Objetivo
Na aba **V2 — Signing Engine** (Configurações → Integrações → SuvSign), permitir escolher, para cada modelo da SuvSign, qual **Tipo de documento** do Seialz ele gera (os mesmos tipos de "Documentos exigidos para fechar": Contrato, Procuração, Declaração de Hipossuficiência...). Quando o documento é assinado, o PDF entra no CRM já com esse tipo, e passa a contar para a regra de "documentos exigidos para fechar".

## Situação atual (confirmada)
- Ao concluir a assinatura, o webhook `suvsign-v2-webhook` (`storePdf`) salva o PDF em `documents` **sem tipo** e sempre no **contato** (`entity_type='contact'`).
- Logo, hoje um contrato assinado pela V2 não cumpre a checklist de fechamento.

## O que o usuário vai ver
Nova seção na aba V2: **"Tipos de documento dos modelos"**.
- Lista os modelos da conta SuvSign (a mesma lista do "Novo envio").
- Ao lado de cada um, um seletor com os tipos habilitados na organização, agrupados por categoria e separados em "do contato" / "da oportunidade".
- Opção "Sem tipo" (comportamento de hoje).
- Salva ao escolher. Só quem pode gerenciar integrações edita.

## Efeito no documento assinado
- Modelo com tipo: o PDF é salvo com esse tipo, no contato ou na oportunidade conforme o tipo (igual à regra da checklist).
- Modelo sem tipo: exatamente como hoje.
- Envios já feitos continuam como estão (sem reprocessar) — [INCERTO] se quiser corrigir os antigos, é tarefa separada.

## Fora do escopo
V1, templates, renderer, snapshot, prévia, envio, SuvSign.

## Detalhes técnicos
1. Discovery antes de codar: confirmar colunas de `documents` (`document_type_id`, suporte a `entity_type='opportunity'`) e se `snapshot.documents[i]` guarda o `template_id` de cada documento, para casar o `document_id` do webhook com o modelo.
2. Migration: tabela `suvsign_v2_template_document_types` (`organization_id`, `template_id` text, `document_type_id` → `document_types`, `created_by/updated_by`, timestamps, unique `(organization_id, template_id)`); GRANT a `authenticated`/`service_role`; RLS: leitura por membros da org (`organization_id = ANY(current_user_org_ids())`), escrita só com `can_manage_integrations_in_org`; trigger garantindo que o tipo é global ou da mesma org.
3. UI: novo componente dentro da aba V2 (sem alterar `SuvSignV2CredentialsCard`), lista via `signature-requests list_templates` e tipos via `useDocumentCatalog` (só habilitados).
4. Webhook: em `storePdf`, buscar o vínculo pelo `template_id` do documento; se existir, gravar `document_type_id` e usar a entidade conforme `owner_type` (oportunidade → `r.opportunity_id`). Sem vínculo → caminho atual. Publicar explicitamente.
5. Documentar em `docs/integrations/suvsign-v2.md`.
