

## PROBLEMA CRITICO: Mensagens de clientes sendo DESCARTADAS silenciosamente

### Diagnostico

Os logs da edge function `twilio-whatsapp-webhook` mostram claramente:

```
[SECURITY] Message To +551150265098 does NOT match org 40ae935c-a7f7-4ad7-8ea4-91be6404a95f configured number +551150287027. Rejecting to prevent cross-org leak.
```

**O que acontece:** O Twilio envia mensagens destinadas ao numero `+551150265098` (Viagi) para o webhook configurado com `orgId=40ae935c-a7f7-4ad7-8ea4-91be6404a95f` (Central Trabalhista). A validacao de seguranca rejeita porque o numero nao bate com o da Central Trabalhista.

**Causa raiz:** Ambas as orgs (Viagi e Central Trabalhista) compartilham a mesma conta Twilio (`ACb23290428df33e5f2961c8bc0394d47e`). No Twilio, cada numero so pode ter UM webhook URL configurado. Quando o webhook da Central Trabalhista foi configurado por ultimo, ele sobrescreveu o webhook do numero da Viagi, OU o Twilio Messaging Service esta roteando ambos os numeros para o mesmo webhook.

### Correcao (duas partes)

#### Parte 1: Tornar o webhook resiliente (edge function)

Atualizar `supabase/functions/twilio-whatsapp-webhook/index.ts` para, quando o numero `To` nao corresponder ao `orgId` da URL, **buscar a org correta pelo numero** em vez de rejeitar a mensagem:

```
// Linhas 311-324 - Substituir a rejeicao por lookup dinamico
if (toNormalized !== configNormalized) {
  // Em vez de rejeitar, buscar a org correta pelo numero To
  const { data: correctOrg } = await supabase
    .from('organization_integrations')
    .select('organization_id, config_values, whatsapp_inbound_settings')
    .eq('is_enabled', true)
    .single() // filtrar pelo numero

  if (correctOrg) {
    // Redirecionar para a org correta
    orgId = correctOrg.organization_id
    // Atualizar credenciais e settings
  } else {
    // Agora sim rejeitar - numero nao pertence a nenhuma org
    console.warn('[SECURITY] To number not found in any org')
    return reject
  }
}
```

Na pratica: consultar TODAS as integration configs para encontrar qual org tem `whatsapp_number` igual ao `To`, e processar a mensagem nessa org.

#### Parte 2: Verificar/corrigir webhooks no Twilio

Apos o deploy do fix, o sistema vai funcionar mesmo com webhook "errado". Mas idealmente cada numero deve apontar para o `orgId` correto. Isso pode ser feito pelo botao "Corrigir Webhooks" na tela de integracoes.

### Arquivo afetado

- `supabase/functions/twilio-whatsapp-webhook/index.ts` - Refatorar a validacao de seguranca (linhas ~311-324) para fazer lookup por numero em vez de rejeitar

### Impacto

- **Imediato**: Todas as mensagens de todos os clientes voltam a ser recebidas
- **Sem risco de seguranca**: O lookup garante que a mensagem va para a org dona do numero, nao para uma org aleatoria
- **Retrocompativel**: Se o orgId do webhook estiver correto, funciona como antes (sem query extra)

