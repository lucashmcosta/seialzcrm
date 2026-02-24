

# Adicionar Data de Fechamento ao payload do SuvSign

## Resumo
Incluir o campo `close_date` da oportunidade no payload enviado ao SuvSign, formatado no formato extenso em portugues (ex: "23 de fevereiro de 2026").

## Mudanca

### Arquivo: `src/components/signature/SendToSignatureButton.tsx`

No bloco onde os dados da oportunidade sao adicionados ao payload (por volta da linha 80), adicionar a `close_date` formatada:

```typescript
if (opportunity) {
  payload.custom.deal_id = opportunity.id;
  payload.custom.deal_title = opportunity.title;
  if (opportunity.amount) {
    payload.custom.deal_amount = String(opportunity.amount);
  }
  // NOVO: adicionar close_date formatada
  if (opportunity.close_date) {
    const date = new Date(opportunity.close_date + 'T00:00:00');
    payload.custom.deal_close_date = date.toLocaleDateString('pt-BR', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    // Resultado: "23 de fevereiro de 2026"
  }
}
```

Tambem sera necessario incluir `close_date` no select da query de oportunidade (linha 75):

```typescript
// ANTES:
.select('id, title, amount, currency')

// DEPOIS:
.select('id, title, amount, currency, close_date')
```

## Resultado no payload

O campo `custom.deal_close_date` sera enviado no formato extenso:

```json
{
  "client": { "firstName": "Joao", "lastName": "Teste", "email": "...", "phone": "..." },
  "custom": {
    "deal_id": "6387f1d2-...",
    "deal_title": "Oportunidade Teste",
    "deal_amount": "100",
    "deal_close_date": "23 de fevereiro de 2026",
    "cpf": "..."
  }
}
```

No SuvSign, basta mapear o campo `deal_close_date` para o placeholder correspondente no template do documento.

