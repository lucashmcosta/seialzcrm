# Corrigir envio da mensagem longa para Matheus

## Objetivo
Fazer o envio da mensagem longa do Matheus funcionar e, se houver recusa do Twilio/WhatsApp, mostrar o motivo real com clareza.

## O que já foi confirmado
- A conversa do Matheus está aberta, é `customer` e já tem `primary_endpoint_id` válido.
- O problema não é o bloqueio por atribuição que aparece em outros casos.
- A mensagem fornecida tem cerca de **2873 caracteres**.
- A documentação do Twilio indica limite geral de **1600 caracteres** no campo `Body` do endpoint `Messages` e erro típico `21617` quando o corpo excede esse tamanho.
- O `InboxComposer` hoje depende do `twilio-whatsapp-send`, mas não tem tratamento explícito para limite de tamanho nem garante exposição do detalhe retornado pelo Twilio para esse caso.

## Plano
1. **Adicionar validação de tamanho antes do envio no Inbox**
   - Validar o tamanho do texto antes de chamar `twilio-whatsapp-send`.
   - Bloquear envio livre quando o texto exceder o limite suportado pelo canal.
   - Exibir mensagem clara orientando a dividir o texto em partes ou usar template quando aplicável.

2. **Endurecer a edge function `twilio-whatsapp-send`**
   - Adicionar guarda server-side para corpo acima do limite aceito pelo Twilio.
   - Retornar erro estruturado e específico para `message_too_long` antes de chamar a API externa.
   - Preservar logs detalhados para diferenciar validação local de erro retornado pelo Twilio.

3. **Melhorar a tradução de erros no Inbox**
   - Mapear `message_too_long` e também o erro Twilio `21617` para uma mensagem amigável e objetiva.
   - Garantir que o usuário veja o motivo real do bloqueio, em vez de um genérico “falha ao enviar”.

4. **Validação final focada no caso do Matheus**
   - Confirmar que textos curtos continuam enviando normalmente.
   - Confirmar que esse texto longo específico gera aviso claro e previsível.
   - Confirmar que o fluxo não fica em falha silenciosa.

## Detalhes técnicos
- Arquivos prováveis:
  - `src/components/inbox/InboxComposer.tsx`
  - `supabase/functions/twilio-whatsapp-send/index.ts`
- Regra proposta:
  - Mensagens livres acima de 1600 caracteres não serão enviadas pelo caminho atual de WhatsApp/Twilio.
  - O sistema retornará erro específico e legível.
- Resultado esperado:
  - Você vai saber exatamente por que essa mensagem não vai.
  - O sistema deixa de parecer quebrado e passa a orientar corretamente o usuário.