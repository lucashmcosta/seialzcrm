# Correção pontual: documentos do JONAS LEAL PEREIRA → Nammux

## O que foi confirmado agora (read-only)

- Contato `c8c1b2fa…` / oportunidade `bee0b9f0-1d2f-465a-8f6d-e5eefd4b36ce` (won, Central Trabalhista `40ae935c…`).
- Os **6 documentos** do contato estão com `document_type_id = NULL`, `is_current = true`, `is_single = false`, `content_hash = NULL`.
- `fn_build_opportunity_won_payload` monta `document_submissions` **apenas** com linhas que têm `document_type_id IS NOT NULL` (`join document_types`). Com tipo nulo, os 6 arquivos aparecem só em `attachments` — por isso o Nammux não mostra documento nenhum.
- O catálogo `document_types` é **global** (`organization_id = NULL`); não há linhas em `organization_document_types` para essa org, logo todos os códigos globais estão disponíveis.

## Resposta às suas duas perguntas

### 1. Como tipificar os 6 documentos já enviados

Tipificação por nome de arquivo + extensão, usando códigos já existentes no catálogo:

| Arquivo | Tipo atribuído | Código |
|---|---|---|
| `endere.jpg` | Comprovante de residência | `COMPROVANTE_RESIDENCIA` |
| `enderreçodd.jpg` | Comprovante de residência | `COMPROVANTE_RESIDENCIA` |
| `RG  3.jpg` | RG / Carteira de Identidade | `RG` |
| `RG JO.jpg` | RG / Carteira de Identidade | `RG` |
| `FGTS SSSS.pdf` | Extrato analítico do FGTS | `EXTRATO_FGTS` |
| `CTPS SSS.pdf` | CTPS | `CTPS` |

Não há bloqueio de duplicidade: `documents_single_current_uk` só se aplica quando `is_single = true` (aqui é `false`) e `documents_hash_uk` só quando `content_hash` não é nulo (aqui é nulo). Ou seja, os dois RGs e os dois comprovantes de residência podem coexistir com o mesmo tipo, sem substituição nem soft-delete.

### 2. Quais tipos o Nammux espera

O envelope não usa enum próprio do Nammux: `document_submissions` carrega `document_type_code` e `document_type_name` **como pass-through** do nosso catálogo (`document_types.code` / `.name`), mais `file_name`, `mime_type`, `size_bytes`, `bucket`, `storage_path` e `status = 'approved'` fixo. Não existe, no nosso lado (código, migrations ou docs), nenhuma tabela/lista de códigos aceitos pelo Nammux — a validação, se houver, é do lado deles. `[INCERTO]` até confirmarem se rejeitam códigos desconhecidos. O único requisito verificável aqui é: ter `document_type_id` preenchido e `entity_type = 'contact'`.

## Execução (fase 1 — só este cliente)

1. **Data change** (ferramenta de dados, não migration): `UPDATE public.documents SET document_type_id = <id do código acima> WHERE id = <cada um dos 6 ids>`, restrito a `organization_id = 40ae935c…` e `deleted_at IS NULL`.
2. **Verificar o payload** antes de reenviar: `SELECT jsonb_array_length(fn_build_opportunity_won_payload('bee0b9f0…')->'document_submissions')` → esperado `6`.
3. **Replay** do evento `opportunity.won` via `nammux-replay-opportunity` para essa oportunidade.
4. **Conferir** o job em `integration_jobs` (`ok:true`, `duplicate`, `attempts`) e a resposta do Nammux; depois você valida na tela do Nammux se os 6 documentos apareceram.

Nenhuma alteração de schema, trigger, RLS ou frontend nesta fase.

## Fase 2 (só depois da validação)

Correção definitiva na tela de upload: tornar o tipo de documento parte do fluxo (evitar `document_type_id` nulo), tratar os arquivos legados sem tipo e decidir se anexos sem tipo devem entrar em `document_submissions`. Desenho detalhado fica para um plano próprio, após confirmarmos que a tipificação resolve o Nammux.
