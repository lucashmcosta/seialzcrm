## Objetivo

Criar um contato de teste "Junior Teste" (+55 11 96429-8621) na organização **Viagi** e uma thread de WhatsApp com mensagens simuladas para aparecer na tela `/inbox`, permitindo testar o composer (texto, nota interna, reply, etc) **sem disparar nada para o número real**.

## Importante: nada será enviado pelo Twilio

A criação é feita apenas via `INSERT` no banco. Nenhuma edge function é chamada. As mensagens "do cliente" são inseridas com `direction='inbound'` direto na tabela `messages`, simulando que o cliente mandou.

Quando você responder pelo composer do Inbox, aí sim o fluxo real será exercitado — mas como o telefone é o seu, é seguro.

## O que vou inserir (via insert tool, não migration)

1. **Contact** em `public.contacts`:
   - `organization_id`: Viagi (`b246ef6f-6242-4011-a112-6d8783d2896a`)
   - `full_name`: Junior Teste
   - `phone`: `+5511964298621`
   - `phone_normalized`: variantes BR (com/sem 9º dígito) para o matching
   - `lifecycle_stage`: `customer` (obrigatório para Inbox aceitar)
   - `source`: `manual_test`

2. **Message thread** em `public.message_threads`:
   - `organization_id`: Viagi
   - `contact_id`: do contato acima
   - `channel`: `whatsapp`
   - `status`: `open` (não-resolved, para o composer liberar envio)
   - `primary_endpoint_id`: endpoint WhatsApp ativo da Viagi (vou buscar)
   - `last_inbound_at` / `whatsapp_last_inbound_at`: `now()` (janela 24h aberta → texto livre permitido)

3. **2 mensagens inbound** em `public.messages` simulando o cliente:
   - "Oi, tudo bem? Esse é um teste." (há 5 min)
   - "Pode me responder por aqui." (há 1 min)
   - `direction='inbound'`, `channel='whatsapp'`, `is_internal_note=false`
   - Triggers existentes vão atualizar `last_message_*` automaticamente

## Como testar depois

1. Abrir `/inbox` → aba **Ativos** → a thread "Junior Teste" deve aparecer.
2. Selecionar a thread → testar:
   - Texto livre (dentro da janela 24h)
   - Nota interna (não chama Twilio, não altera last_message)
   - Reply/quote
   - Mídia / áudio (se quiser, será entregue no seu WhatsApp real)
3. Validar timeline em realtime.

## Limpeza

Quando terminar o teste, é só me pedir "remove o contato Junior Teste" e eu apago tudo (thread, mensagens, contato).

## Confirmação necessária

Sigo com a criação na **Viagi**?
