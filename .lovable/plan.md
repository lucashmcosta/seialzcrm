

## Restaurar contato e revincular à oportunidade

Duas operações SQL via insert tool:

1. **Restaurar contato**: `UPDATE contacts SET deleted_at = NULL WHERE id = 'a82dc5d1-b51c-46fc-8454-4b4002ad2778'`
2. **Revincular à oportunidade**: `UPDATE opportunities SET contact_id = 'a82dc5d1-b51c-46fc-8454-4b4002ad2778' WHERE id = 'f5db173b-caed-49b7-b68e-e4c1d878a64c'`

