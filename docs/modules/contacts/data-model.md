# Modelo de dados — Contatos

## Tabelas
| Tabela | Papel |
|---|---|
| `contacts` | 61 colunas — entidade principal (nome, telefones, e-mails, CPF/RG, endereço, org, owner) |
| `companies` | vínculo pessoa jurídica |
| `contact_memories` | memória de longo prazo usada pelo agente IA (15 col) |
| `tag_assignments` | associa `tags` a contatos |
| `custom_field_values` | valores de `custom_field_definitions` |
| `communication_endpoints` | número/canal preferencial |
| `activities` | histórico (log) |
| `attachments` | anexos |
| `contacts_merge_log` | auditoria de unificações |
| `backup_meta_backfill_2026_05_28_contacts` | backup one-shot (candidato a arquivamento) |

## RLS
`organization_id = ANY(current_user_org_ids())` — SELECT/INSERT/UPDATE/DELETE para `authenticated`, `ALL` para `service_role`.

## Hooks relevantes
- `src/hooks/contacts/useContactConversationsByContext.ts`
- `src/hooks/documents/useContactDocuments.ts`
