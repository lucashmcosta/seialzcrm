## Problema

Quando um novo usuário é adicionado à organização, ele já entra automaticamente no rodízio (round-robin) e começa a receber leads/contatos/oportunidades — o que não deveria acontecer. O admin precisa habilitar manualmente.

## Causa Raiz

Na migração `20260419204912_...sql`, a coluna `user_organizations.round_robin_active` foi definida com:

```sql
ADD COLUMN IF NOT EXISTS round_robin_active boolean NOT NULL DEFAULT true
```

Como o default é `true`, todo novo membro entra opt-in no rodízio. Basta o perfil de permissão dele ter `round_robin_recipient=true` (ou ser ativado depois) para começar a receber leads imediatamente.

## Correção

### 1. Migração de schema
Alterar o default da coluna para `false`:

```sql
ALTER TABLE public.user_organizations
  ALTER COLUMN round_robin_active SET DEFAULT false;
```

Não vou tocar nos registros existentes (usuários já configurados continuam como estão). Apenas novos membros entrarão como opt-out.

### 2. UI (`src/components/settings/RoundRobinSettings.tsx`)
Nenhuma mudança necessária — a tela já permite ativar/desativar manualmente o "recebe leads" por usuário. Apenas o estado inicial passa a ser desligado.

## Resultado

- Novos usuários adicionados à organização entram com `round_robin_active = false` → não recebem leads automaticamente.
- O admin precisa entrar em **Configurações → Round-Robin** e ativar o toggle para cada usuário que deve receber.
- Usuários existentes não são afetados.