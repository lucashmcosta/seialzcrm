# Cadastro de novo número WhatsApp via interface

Lucas precisa cadastrar o novo número WhatsApp da Central Trabalhista sem rodar SQL. Vamos adicionar um formulário simples na tela de integração WhatsApp para inserir o endpoint diretamente em `communication_endpoints`.

## Onde fica

Em `src/components/settings/WhatsAppIntegrationStatus.tsx` (card "WhatsApp Business" em `/settings/integrations`), adicionar um botão **"Adicionar número"** ao lado de "Atualizar / Verificar Webhooks / Reconectar".

O botão abre um `Dialog` (shadcn) com 3 campos:

- **Número WhatsApp** (`external_address`) — input com máscara/validação E.164 (`+55…`). Obrigatório.
- **Sender SID Twilio** (`sender_sid`) — input texto, deve começar com `XE`. Obrigatório.
- **Nome de exibição** (`display_name`) — input texto opcional (ex.: "CT — Lucas").

Botões: **Cancelar** / **Cadastrar**.

## O que o submit faz

Insere uma linha em `public.communication_endpoints` via `supabase.from('communication_endpoints').insert({...})` com:

```
organization_id           = organization.id (do contexto atual)
organization_integration_id = id da integration 'twilio-whatsapp' ativa da org
channel                   = 'whatsapp'
external_address          = input do form (trim, valida regex E.164)
external_account_id       = config_values.account_sid da integration
sender_sid                = input do form (trim, valida começa com 'XE')
display_name              = input do form ou null
is_active                 = true
status                    = 'online'
metadata                  = {}
```

O `organization_integration_id` e o `external_account_id` são lidos da mesma query que `WhatsAppIntegrationStatus` já faz em `getCredentials()` (não precisa hardcode da CT — funciona para qualquer org com Twilio WhatsApp habilitado).

Após sucesso: `toast.success`, fecha o dialog, chama `refetch()` do hook de integração. O novo endpoint passa automaticamente no filtro do dropdown de `/messages` porque `created_at > MIGRATION_GHOST_CUTOFF`.

## Validações (client-side, zod)

- `external_address`: regex `^\+[1-9]\d{7,14}$`
- `sender_sid`: regex `^XE[a-zA-Z0-9]{32}$`
- `display_name`: opcional, max 100 chars

Erro de constraint do banco (ex.: número duplicado na mesma org) → toast com mensagem amigável.

## RLS

A policy de INSERT em `communication_endpoints` exige que o usuário tenha acesso à org. Como Lucas é admin da CT, o insert passa sem alterar policies.

## Fora de escopo

- Não mexer em `useOrgWhatsAppEndpoints.ts` (filtro já cobre o caso).
- Não mexer no Inbox, Viagi, migrations, `twilio-whatsapp-send`, sandbox.
- Não criar fluxo de edição/remoção — apenas cadastro.

## Arquivos

- **novo** `src/components/settings/AddWhatsAppEndpointDialog.tsx` — dialog + form + insert
- **editar** `src/components/settings/WhatsAppIntegrationStatus.tsx` — adicionar botão "Adicionar número" que abre o dialog

## Validação após implementar

1. Em `/settings/integrations` da CT, clicar "Adicionar número", preencher com os dados do Lucas, salvar.
2. Conferir toast de sucesso.
3. Ir em `/messages`: dropdown "Enviar de" deve mostrar `…7027` + novo número.
4. Viagi: sem alteração.
