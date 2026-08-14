# Evolution 7020 — inbound ausente com sessão viva (auditoria read-only concluída)

## Relatório solicitado

```text
PHONE_RECEIVED_INBOUND=YES (informado pelo operador)
BAILEYS_SESSION_OPEN=YES        (connectionState=open, ownerJid 551150287020@s.whatsapp.net)
BAILEYS_DEVICE_LINKED=YES       (sessão pareada e ativa; profileName "Central Trabalhista",
                                 profilePicUrl e contatos sincronizados)
DEVICE_LINKED_AT=2026-08-14T17:13:52Z (createdAt da instância) / último update 18:03:44Z
APP_STATE_SYNC=OK               (contatos 446, chats 276, histórico 5.386 msgs importadas;
                                 contato de João Teste sincronizado às 17:15:03)
NON_MESSAGE_EVENTS=YES          (messages.update/receipts chegando ao webhook até 18:43:45Z,
                                 inclusive receipts fromMe:false — socket vivo e entregando)
MESSAGES_UPSERT_RECEIVED=NO     (último messages.upsert: 18:20:40Z, outbound fromMe:true;
                                 zero mensagens de 5511964298621 na store da instância)
SESSION_ERRORS=indisponível pela API (Evolution v2 não expõe /logs);
                nenhum disconnectionReasonCode / disconnectionObject / disconnectionAt na instância
EVOLUTION_VERSION=2.3.7 (clientName evolution_divus)
BAILEYS_VERSION=não exposto pela API; WhatsApp Web pinado em 2.3000.1045220589
INSTANCE_SETTINGS=padrão (rejectCall=false, groupsIgnore=false, alwaysOnline=false,
                  readMessages=false, readStatus=false, syncFullHistory=false) — igual ao default
                  de criação manual no Manager
WEBHOOK=enabled, byEvents=false, base64=false, eventos CONNECTION_UPDATE/QRCODE_UPDATED/
        MESSAGES_UPSERT/MESSAGES_UPDATE (válido; entrega comprovada)
```

LIKELY_ROOT_CAUSE: a sessão Baileys está registrada e recebendo tráfego de sinalização
(receipts/updates/contatos), mas não está materializando notificações de mensagem de entrada.
O último inbound real na store é 17:15:37Z — cerca de 2 minutos após o pareamento — e depois
disso somente eventos de status. Isso caracteriza degradação do canal de mensagens do próprio
socket (falha de decrypt/Signal session/pre-key silenciosa ou dessincronia de endereçamento
@lid do Evolution 2.3.7, que grava todos os chats como `<id>@lid` e não consegue associar o
remetente `5511964298621@s.whatsapp.net`), e não problema de configuração, de webhook, de
parser do CRM ou de roteamento externo do número.

Achado secundário (não é a causa): todos os eventos `evolution_api` recentes estão com
`process_status = failed` em `integration_inbound_events` — o parser rejeita `messages.update`.
Isso não afeta inbound de mensagem, mas gera ruído e mascara diagnóstico.

SAFE_NEXT_STEP: nada foi reiniciado, deslogado ou re-pareado. Duas frentes possíveis, ambas
sem tocar Meta 7067 / Meta histórico 7020 / Atendimento:

## Próximos passos propostos (escolher antes de qualquer ação)

1. Confirmação no aparelho (zero risco, manual)
   - No celular 7020: WhatsApp > Aparelhos conectados > verificar se a sessão Evolution
     aparece e qual a data/hora. A API não expõe isso; só o aparelho responde.
   - Enviar novo inbound de um terceiro número e reauditar store + `integration_inbound_events`.
     Se continuar ausente com receipts fluindo, a degradação do socket está confirmada.

2. Recuperação da sessão (requer sua autorização explícita)
   - Opção A: `restart` da instância (mantém credenciais, força re-handshake do socket).
     Menor intervenção; sem novo QR; risco baixo.
   - Opção B: logout + novo QR (recria Signal keys). Só se A não resolver.
   - Nenhuma opção altera `active_endpoint_id` (Meta 7067 segue ativo), `messaging_lines`,
     `messaging_line_rotations` nem o endpoint Meta histórico 7020.

3. Higiene do parser (independente, opcional)
   - Corrigir o handler de `messages.update` no `evolution-webhook` para não marcar eventos
     legítimos de status como `failed`.

Nada será executado sem sua autorização.
