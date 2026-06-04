# Build — Módulo de Documentos V1

Migration já aplicada (tabelas `document_types`, `document_submissions`, função `can_review_contact_documents`, RLS com validação de integridade). Agora segue o build do frontend.

## Passos

### 1. Hooks
- `src/hooks/documents/useDocumentTypes.ts` — CRUD + realtime para catálogo de tipos (admin).
- `src/hooks/documents/useContactDocuments.ts` — lista derivada (junta `document_types` ativos com `document_submissions` do contato, status `pending` derivado quando não há submission). Inclui ações: upload, aprovar, rejeitar, substituir, excluir (soft-delete).

### 2. Settings → Documentos
- Rota: `/settings/documents` (admin only).
- Página: `src/pages/settings/DocumentsSettings.tsx` — usa `Layout`, lista tipos com ordenação, criar/editar/desativar.
- Dialog: `DocumentTypeFormDialog` (nome, code, obrigatório, ordem).
- Adicionar card no `SettingsGrid`.
- Registrar rota em `App.tsx`.

### 3. Componente Checklist (reutilizável)
- `src/components/documents/DocumentChecklist.tsx` — recebe `contactId`, renderiza linha por tipo:
  - status badge (pending / uploaded / approved / rejected)
  - botão Upload (quando pending/rejected)
  - preview/download do anexo
  - ações: Aprovar / Rejeitar (com motivo) / Substituir / Excluir, condicionadas a `can_review_contact_documents`.
- `DocumentUploadDialog` — usa bucket `attachments` existente, cria registro em `attachments` com `entity_type='contact_document'`, `entity_id=contactId`, depois insere/atualiza `document_submissions` (status `uploaded`, zera campos de review).
- `DocumentRejectDialog` — captura `rejection_reason`.

### 4. Integração Contato
- Aba "Documentos" já existe em `ContactDetail.tsx` → ligar ao novo `DocumentChecklist`.

### 5. Integração Oportunidade
- Adicionar aba "Documentos" em `OpportunityDetail.tsx` → renderiza `<DocumentChecklist contactId={opportunity.contact_id} />` (espelho puro).

### 6. Regras de negócio chave
- Substituir aprovado → novo submission volta a `uploaded`, zera `reviewed_by_user_id`, `reviewed_at`, `rejection_reason`.
- Excluir → soft-delete em `document_submissions.deleted_at` E em `attachments.deleted_at`.
- Sem upload livre — só dentro de slots configurados.
- Sem campos/UI de validade/expiração.

### 7. i18n
- Adicionar chaves `documents.*` em pt-BR (e en se existir).

### 8. QA manual
- Criar tipo em Settings.
- Upload no Contato → aparece na Oportunidade.
- Aprovar / Rejeitar com motivo.
- Substituir aprovado → volta a uploaded.
- Excluir → some das duas abas.
- Verificar realtime entre Contato e Oportunidade.

## Entregáveis ao final
Lista de arquivos criados/alterados, evidência de espelhamento Contato↔Oportunidade, validação dos fluxos e confirmação de ausência de validade/expiração.
