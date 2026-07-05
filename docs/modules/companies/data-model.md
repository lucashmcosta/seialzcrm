# Modelo de dados — Empresas

| Tabela | Papel |
|---|---|
| `companies` | 11 colunas — pessoa jurídica, org owner |
| `contacts.company_id` | FK do contato |

RLS: padrão `organization_id = ANY(current_user_org_ids())`. 5 políticas.
