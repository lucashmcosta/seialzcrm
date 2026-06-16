## Objetivo

Limpar o dropdown "Enviar de" da Central Trabalhista mostrando apenas o número oficial atual (`…7027`) e, no futuro, o número que o Lucas vai inserir — sem alterar banco, migration, RLS ou envio.

## Restrição técnica encontrada

RLS de `organization_integrations` (`user_has_org_access(organization_id)`) impede o frontend de ler `config_values.whatsapp_number` de **outras** orgs. Logo, a regra "address é whatsapp_number de outra org → ocultar" não é executável puramente no cliente sem RPC SECURITY DEFINER (que exigiria migration — proibido pelo usuário).

## Regra alternativa equivalente (pura frontend)

Todas as duplicatas fantasmas (incluindo `…5098` sob CT) foram criadas no **mesmo batch de migration** com `created_at = 2026-05-28 17:22:02.165649+00`. Isso dá uma assinatura confiável e localizada para o problema atual.

Regra do hook (composição AND/OR, todas avaliadas no array já carregado):

1. `is_active = true` (já existe)
2. `channel = 'whatsapp'` (já existe)
3. `sender_sid IS NOT NULL` (já existe)
4. `status <> 'offline'` (já existe)
5. **Novo:** manter o endpoint se **qualquer** das condições for verdadeira:
   - `external_address === ownIntegrationWhatsappNumber` (número oficial da própria org), **ou**
   - `created_at > '2026-05-28T17:22:03Z'` (criado fora do batch da migration — cobre Lucas e qualquer inserção futura via `twilio-whatsapp-setup`)

Endpoints originados na migration **que não sejam o número oficial da própria org** ficam ocultos. O `…7027` passa pela cláusula "é o whatsapp_number da CT"; o `…5098` (fantasma na CT) falha em ambas e some.

## Mudança (1 arquivo, ~15 linhas)

**`src/hooks/useOrgWhatsAppEndpoints.ts`**

- Adicionar uma segunda query ao Supabase para buscar `config_values->>'whatsapp_number'` das `organization_integrations` **da própria org** (RLS permite). Pegar todos os números não-nulos em um `Set<string>` (`ownNumbers`).
- Após o `.then` da query de endpoints, aplicar filtro no array:
  ```ts
  const MIGRATION_CUTOFF = '2026-05-28T17:22:03Z';
  const filtered = data.filter(ep =>
    ownNumbers.has(ep.external_address) ||
    new Date(ep.created_at) > new Date(MIGRATION_CUTOFF)
  );
  ```
- Incluir `created_at` no `.select(...)` e no tipo `OrgEndpoint`.
- Constante `MIGRATION_CUTOFF` documentada com comentário curto explicando o batch fantasma.

Sem mudanças em `EndpointSelector`, `EndpointBadge`, `useThreadEndpointMap`, `MessagesList`, edge functions, RLS, schema, ou Inbox.

## Resultado esperado

| Org | Endpoints visíveis hoje |
|---|---|
| **Central Trabalhista** | `+551150287027` (passa por `ownNumbers`) |
| **Viagi** | `+551150265098` (passa por `ownNumbers`) → 1 endpoint → dropdown segue oculto (`hasMultiple` false) |

Após o INSERT do Lucas (com `created_at = now()` > cutoff):
- CT passa a mostrar `…7027` + número novo do Lucas (2 opções, dropdown aparece).
- Viagi segue inalterada.

Sandbox `+14155238886` segue oculto (`status='offline'`). Fantasmas `available_numbers` seguem ocultos (`sender_sid IS NULL`).

## Validação pós-deploy

1. Login CT → `/messages` → dropdown não aparece (só 1 endpoint visível: `…7027`).
2. Console: `useOrgWhatsAppEndpoints` retorna `endpoints.length === 1` para CT.
3. Login Viagi → `/messages` → sem dropdown (1 endpoint `…5098`).
4. Após `INSERT` do Lucas → CT mostra dropdown com `…7027` + número novo.
5. Envio por `…7027` continua funcionando (roteamento inalterado).

## Reversão

Remover a query extra de `ownNumbers`, a constante `MIGRATION_CUTOFF` e o `.filter(...)` adicionados. Volta ao comportamento atual (7 endpoints filtrados só pelos 4 critérios anteriores).

## O que NÃO muda

- `communication_endpoints` (sem INSERT/UPDATE/DELETE)
- Migrations / schema / RLS
- `twilio-whatsapp-send` (roteamento por `organization_id` segue como está)
- Inbox v2, Viagi, mobile, envio
