
# Vincular notas do lead a oportunidade

## Problema

No `lead-webhook`, as notas sao criadas **antes** da oportunidade. Por isso, mesmo quando `create_opportunity: true`, a nota fica vinculada apenas ao contato (`contact_id`) e o campo `opportunity_id` da activity fica `null`.

## Solucao

Reordenar o codigo no edge function para:
1. Criar o contato (como ja faz)
2. Criar a oportunidade (se `create_opportunity: true`)
3. Criar a nota **por ultimo**, incluindo o `opportunity_id` se a oportunidade foi criada

## Alteracao

### Arquivo: `supabase/functions/lead-webhook/index.ts`

Mover o bloco de criacao de nota (linhas 163-183) para **depois** do bloco de criacao de oportunidade (apos linha 219). Ao criar a activity, incluir `opportunity_id: opportunityId` no insert.

Resultado do insert da activity:
```typescript
.insert({
  organization_id: organizationId,
  contact_id: contactId,
  opportunity_id: opportunityId,  // <-- agora vincula a oportunidade
  activity_type: 'note',
  title: 'Nota do lead externo',
  body: payload.notes.trim(),
})
```

Nenhuma mudanca de banco necessaria -- a coluna `opportunity_id` ja existe na tabela `activities`.
