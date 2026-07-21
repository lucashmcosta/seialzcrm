## Execução aprovada

### 1. Corrigir endpoint Evolution `dev-int` (Viagi)

O `CHECK` de `communication_endpoints.purpose` só aceita `commercial | customer_service | vendor_personal | other`. O trigger `fn_message_threads_autofill_business_context` já mapeia `commercial → sales`. Portanto o valor correto no endpoint é `commercial`:

```sql
UPDATE communication_endpoints
   SET purpose = 'commercial', updated_at = now()
 WHERE id = '11111111-e701-4a01-8000-000000000001'
   AND provider = 'evolution_api'
   AND purpose = 'other';
```

### 2. Backfill das 23 threads

```sql
UPDATE message_threads
   SET business_context = 'sales', updated_at = now()
 WHERE organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'
   AND primary_endpoint_id = '11111111-e701-4a01-8000-000000000001'
   AND business_context = 'other';
```

### 3. Corrigir a origem em `evolution-instance-manager`

O arquivo hoje **não cria endpoints** (comentário linhas 253-256: "NUNCA criamos endpoints/linhas/instâncias novos aqui"). A criação de `communication_endpoints` para Evolution acontece manualmente ou por outra função. Auditar quem criou o endpoint `11111111-...` com `purpose='other'` antes de mudar código:

- Buscar em `supabase/functions/` por `provider: 'evolution_api'` combinado com `insert` em `communication_endpoints`.
- Se encontrado: alterar default de `purpose` para `commercial` (não `other`), aceitando override explícito via parâmetro. Nunca default silencioso para `other`.
- Se não encontrado (endpoint foi criado manualmente por SQL/UI admin): documentar no `docs/integrations/evolution-api/` a regra "endpoints Evolution devem nascer com `purpose='commercial'` salvo escolha explícita" e adicionar validação na UI de admin (`/admin/evolution`) que force a escolha.

### 4. Validação pós-aplicação

```sql
-- Deve retornar 0 linhas
SELECT COUNT(*) FROM message_threads
 WHERE primary_endpoint_id = '11111111-e701-4a01-8000-000000000001'
   AND business_context <> 'sales';

-- Endpoint corrigido
SELECT id, purpose FROM communication_endpoints
 WHERE id = '11111111-e701-4a01-8000-000000000001';
```

- Confirmar visualmente em `/messages` (Viagi) que `evairferreiradesouza11` e `Junior Teste` permanecem após F5.
- Pedir ao usuário enviar 1 nova mensagem pela Evolution → conferir `SELECT business_context FROM message_threads ORDER BY created_at DESC LIMIT 1` → esperado `sales`.

### Restrições respeitadas

- **Não** altero `rpc_list_message_threads`.
- **Não** altero `rpc_get_message_threads_by_ids`.
- **Não** modifico o trigger para tratar todo `evolution_api` como sales.
- Correção estritamente escopada ao endpoint `dev-int` da Viagi + prevenção na criação futura.
