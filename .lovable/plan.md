

# Plano: Selecao de Numero WhatsApp com Senders Twilio

## Resumo

Adicionar modo `list-numbers` na edge function para buscar numeros e WhatsApp Senders existentes, e mostrar um dropdown no frontend para o usuario escolher qual numero usar.

## Arquivos a Modificar

| Arquivo | Mudanca |
|---------|---------|
| `supabase/functions/twilio-whatsapp-setup/index.ts` | Adicionar modo `list-numbers` e parametro `selectedNumber` |
| `src/components/settings/IntegrationConnectDialog.tsx` | Buscar numeros e mostrar dropdown |

---

## Detalhes Tecnicos

### 1. Edge Function: twilio-whatsapp-setup/index.ts

**Linha 31** - Extrair novos parametros:
```typescript
const { organizationId, accountSid, authToken, selectedNumber, mode } = body
```

**Apos linha 74 (apos validacao de credenciais)** - Adicionar bloco `list-numbers`:

Quando `mode === 'list-numbers'`:
- Busca numeros da conta via `GET /IncomingPhoneNumbers.json`
- Busca Messaging Services via `GET https://messaging.twilio.com/v1/Services`
- Para cada service, busca Senders via `GET /Services/{sid}/Senders`
- Filtra senders com prefixo `whatsapp:` e extrai numeros
- Retorna `{ success: true, phoneNumbers, whatsappSenders }` sem fazer setup

**Linha 338** - Usar `selectedNumber` como primario:
```typescript
const primaryNumber = selectedNumber
  || (phoneNumbers.length > 0 ? phoneNumbers[0].phone_number : null)
```

### 2. Frontend: IntegrationConnectDialog.tsx

**Novos estados:**
- `availableNumbers` - lista de numeros com flag `is_whatsapp_sender`
- `selectedWhatsAppNumber` - numero escolhido pelo usuario
- `loadingNumbers` - loading spinner

**Novo useEffect** - Quando `credentialsFromVoice` e true e dialog esta aberto, chama automaticamente a edge function com `mode: 'list-numbers'` para buscar numeros.

**Dropdown no formulario** - Apos o Alert de credenciais detectadas:
- Mostra spinner enquanto carrega
- Mostra Select com numeros disponiveis
- Numeros que ja sao WhatsApp Senders aparecem marcados com "(WhatsApp Sender)"
- Auto-seleciona o primeiro WhatsApp Sender encontrado
- Mostra mensagem de erro se nenhum numero for encontrado

**Enviar selectedNumber no setup** - Adiciona `selectedWhatsAppNumber` no body da chamada.

**Reset ao fechar** - Limpa os novos estados.

---

## Fluxo

```text
1. Abre dialog WhatsApp
2. Credenciais do Voice preenchidas automaticamente
3. Busca numeros da conta Twilio (spinner)
4. Dropdown com numeros + marcacao "WhatsApp Sender"
5. Auto-seleciona primeiro sender
6. Usuario pode trocar
7. Clica Conectar -> setup usa numero selecionado
```

## Regras Preservadas

- Fluxo sem Voice (credenciais manuais) continua igual
- Quando `mode` nao e enviado, comportamento atual mantido
- Todas validacoes e tratamento de erro existentes preservados

