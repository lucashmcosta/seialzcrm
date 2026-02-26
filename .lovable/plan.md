

## Plano: Remover botão "Enviar para Assinatura" da tela de Contato

### Alteração única

**Arquivo:** `src/pages/contacts/ContactDetail.tsx`

1. Remover o import do `SendToSignatureButton` (linha 39)
2. Remover o uso do `<SendToSignatureButton contactId={contact.id} />` (linha 180)

O botão permanece apenas na tela de Oportunidade (`OpportunityDetail.tsx`), onde já é chamado com `contactId` e `opportunityId`, garantindo que o `deal_id` sempre estará presente no payload enviado ao SuvSign.

### Correção adicional no `SendToSignatureButton.tsx`

Aplicar o fix de firstName/lastName para contatos criados manualmente:

```typescript
firstName: contact.first_name || contact.full_name?.split(' ')[0] || '',
lastName: contact.last_name || contact.full_name?.split(' ').slice(1).join(' ') || '',
```

