

# Corrigir Duplicacao de Contatos por Variacao do 9o Digito

## Problema identificado

O sistema esta criando contatos duplicados porque o telefone chega em formatos diferentes:
- `+5543988758000` (com o 9o digito)
- `+554388758000` (sem o 9o digito)

No Brasil, numeros de celular tiveram a adicao do 9o digito. Esses dois numeros pertencem a mesma pessoa, mas a funcao `normalizePhoneForSearch` nos webhooks nao gera a variacao com/sem o 9o digito, entao o sistema nao encontra o contato existente e cria um novo.

Isso resulta em duas conversas separadas na lista de mensagens para o mesmo cliente.

## Solucao

Atualizar a funcao `normalizePhoneForSearch` em dois arquivos de edge functions para gerar variacoes com e sem o 9o digito brasileiro. Tambem criar um script para unificar os contatos duplicados existentes.

---

## Detalhes tecnicos

### Arquivos modificados

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/twilio-whatsapp-webhook/index.ts` | Adicionar logica do 9o digito na `normalizePhoneForSearch` |
| `supabase/functions/twilio-webhook/index.ts` | Mesma correcao na versao dessa funcao |

### Logica do 9o digito

Para numeros brasileiros (+55), apos extrair o DDD (2 digitos apos 55):
- Se o numero local tem 9 digitos e comeca com 9: gerar variacao sem o 9 (8 digitos)
- Se o numero local tem 8 digitos: gerar variacao com 9 na frente (9 digitos)

Exemplo para `+5543988758000`:
- DDD = `43`, local = `988758000` (9 digitos, comeca com 9)
- Variacao sem 9: `+554388758000`

Codigo a adicionar em ambas as funcoes:

```typescript
// Handle Brazil 9th digit variation
if (digits.startsWith('55') && digits.length >= 12) {
  const ddd = digits.slice(2, 4)
  const local = digits.slice(4)
  
  if (local.length === 9 && local.startsWith('9')) {
    // Has 9th digit -> generate without
    const without9 = ddd + local.slice(1)
    variations.add('+55' + without9)
    variations.add('55' + without9)
    variations.add(without9)
  } else if (local.length === 8) {
    // Missing 9th digit -> generate with
    const with9 = ddd + '9' + local
    variations.add('+55' + with9)
    variations.add('55' + with9)
    variations.add(with9)
  }
}
```

### Limpeza de dados existentes

Para os contatos duplicados que ja existem (como "Andre Cruz" e "andre rodrigues da cruz"), sera necessario unificar manualmente ou via SQL. Os dois contatos encontrados:

- `andre rodrigues da cruz` — phone `+5543988758000` (criado 24/jan)
- `Andre Cruz` — phone `+554388758000` (criado 13/fev)

Opcoes:
1. Mover as mensagens/threads do contato duplicado para o original e deletar o duplicado
2. Ou manter ambos e apenas prevenir novos duplicados (a correcao do codigo ja faz isso)

### Ordem de implementacao

1. Atualizar `normalizePhoneForSearch` em `twilio-whatsapp-webhook/index.ts`
2. Atualizar `normalizePhoneForSearch` em `twilio-webhook/index.ts`
3. Deploy das edge functions
4. (Opcional) Script SQL para unificar contatos duplicados existentes

