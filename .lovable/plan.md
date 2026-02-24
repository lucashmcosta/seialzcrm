

# Adicionar Data de Criacao e Ultima Atualizacao no Contato e Oportunidade

## O que muda

Exibir **data de criacao** e **ultima atualizacao** nas paginas de detalhe do Contato e da Oportunidade. Sem campo de origem e sem informacao de quem criou.

---

## Contato (`src/pages/contacts/ContactDetail.tsx`)

No card "Detalhes" (grid existente, linhas 239-303), adicionar dois novos itens ao final do grid:

- **Criado em** - icone `Calendar`, valor formatado de `contact.created_at`
- **Atualizado em** - icone `Calendar`, valor formatado de `contact.updated_at`

Importar `Calendar` do `lucide-react`.

---

## Oportunidade (`src/pages/opportunities/OpportunityDetail.tsx`)

Na aba "overview" (grid existente, linhas 319-380), adicionar dois campos na coluna direita (apos status):

- **Criado em** - valor formatado de `opportunity.created_at`
- **Atualizado em** - valor formatado de `opportunity.updated_at`

---

## Formato de data

Ambos usarao: `dia mes ano, hora:minuto`
Exemplo: `24 fev 2026, 14:06`

```typescript
new Date(value).toLocaleDateString(locale, {
  day: '2-digit', month: 'short', year: 'numeric',
  hour: '2-digit', minute: '2-digit'
})
```

---

## Resumo

| Arquivo | Mudanca |
|---------|---------|
| `src/pages/contacts/ContactDetail.tsx` | Adicionar `created_at` e `updated_at` no grid de detalhes + importar `Calendar` |
| `src/pages/opportunities/OpportunityDetail.tsx` | Adicionar `created_at` e `updated_at` na aba overview |

