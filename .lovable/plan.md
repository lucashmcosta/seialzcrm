

## Plano: Validar campos obrigatórios antes de enviar para assinatura

### Alteração

**Arquivo:** `src/components/signature/SendToSignatureButton.tsx`

Após buscar o contato (linha 52-55), adicionar validação dos campos obrigatórios antes de montar o payload. Campos obrigatórios (baseado no payload):

**client:**
- `firstName` (nome)
- `email`
- `phone`

**custom:**
- `cpf`
- `rg`
- `rg_issuer`
- `nationality`
- `address_street`
- `address_neighborhood`
- `address_city`
- `address_state`
- `address_zip`

Se algum campo estiver vazio, exibir um `toast.error` listando os campos faltantes e interromper o envio. `lastName` é o único campo que pode ir vazio.

Exemplo da mensagem:
> "Campos obrigatórios não preenchidos: Email, CPF, Endereço"

