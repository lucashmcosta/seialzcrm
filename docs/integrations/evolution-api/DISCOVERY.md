# Evolution API — Discovery (Fase 0)

Data: 2026-07-20
Executor: agente Lovable (Fase 0, read-mostly)
Ambiente alvo: servidor Evolution v2.3.7 auto-hospedado (Vultr)

Este documento registra apenas os contratos HTTP reais observados durante a
discovery controlada. Nenhum código de integração foi implementado. Nenhum
registro do banco Seialz foi criado, alterado ou removido.

Todos os valores sensíveis (host, apikey, tokens de instância, base64 do QR,
código WA de pareamento) foram redigidos. Números reais não foram utilizados.
Nenhuma mensagem foi enviada.

---

## 0. Setup e proteção

- Edge Function temporária `evolution-discovery` criada apenas para este ciclo
  e removida ao final.
- Credenciais lidas exclusivamente de env: `EVOLUTION_BASE_URL`,
  `EVOLUTION_GLOBAL_API_KEY`.
- Proteção adicional de execução: header obrigatório `x-discovery-token`
  validado por comparação constante contra um secret temporário
  `EVOLUTION_DISCOVERY_TOKEN` (revogado ao final).
- Cada operação é um `case` fechado no servidor: método, path e schema de
  body fixos. Cliente não pode injetar `url`, `method` ou `path`.
- `instanceName` validado por regex `^evo_discovery_\d+_[a-z0-9]{6}$`.
- Nome da instância temporária desta corrida:
  `evo_discovery_1784569288_8qs3sc` (redigido daqui em diante como
  `<TMP>`).

Todas as chamadas listadas abaixo foram feitas com o header:

```
apikey: ***REDACTED***
content-type: application/json
```

O `Host` do upstream também foi redigido nos exemplos.

---

## 1. Server info

`GET /`

Status: `200`
Content-Type: `application/json; charset=utf-8`

Response:

```json
{
  "status": 200,
  "message": "Welcome to the Evolution API, it is working!",
  "version": "2.3.7",
  "clientName": "evolution_divus",
  "manager": "http://***REDACTED***/manager",
  "documentation": "https://doc.evolution-api.com",
  "whatsappWebVersion": "2.3000.1043466400"
}
```

Confirmado:
- Versão do servidor: `2.3.7`.
- `clientName` global: `evolution_divus`.
- Endpoint responde e valida a apikey global.

---

## 2. Lista de instâncias (snapshot ANTES)

`GET /instance/fetchInstances`

Status: `200`
Content-Type: `application/json; charset=utf-8`
Body: array de instâncias.

Uma instância pré-existente foi observada (`name: "dev-int"`), sem número
conectado (`connectionStatus: "connecting"`). **Não foi tocada.**

Shape de cada item (campos observados, tokens redigidos):

```json
{
  "id": "<uuid>",
  "name": "<string>",
  "clientName": "evolution_divus",
  "integration": "WHATSAPP-BAILEYS",
  "connectionStatus": "connecting | open | close",
  "token": "***REDACTED***",
  "number": null,
  "ownerJid": null,
  "profileName": null,
  "profilePicUrl": null,
  "businessId": null,
  "disconnectionAt": null,
  "disconnectionObject": null,
  "disconnectionReasonCode": null,
  "createdAt": "<iso8601>",
  "updatedAt": "<iso8601>",
  "Setting": {
    "id": "<cuid>",
    "instanceId": "<uuid>",
    "rejectCall": false,
    "msgCall": "",
    "groupsIgnore": false,
    "alwaysOnline": false,
    "readMessages": false,
    "readStatus": false,
    "syncFullHistory": false,
    "wavoipToken": "",
    "createdAt": "<iso8601>",
    "updatedAt": "<iso8601>"
  },
  "Chatwoot": null,
  "Proxy": null,
  "Rabbitmq": null,
  "Sqs": null,
  "Websocket": null,
  "Nats": null,
  "_count": { "Message": 0, "Contact": 0, "Chat": 0 }
}
```

O campo `name` é o identificador humano usado nas rotas por instância.
`id` é o UUID interno (`instanceId`).

---

## 3. Criação da instância temporária

`POST /instance/create`

Body enviado:

```json
{
  "instanceName": "<TMP>",
  "integration": "WHATSAPP-BAILEYS",
  "qrcode": true
}
```

Status: `200`
Content-Type: `application/json; charset=utf-8`

Response (campos observados, valores sensíveis redigidos):

```json
{
  "instance": {
    "instanceName": "<TMP>",
    "instanceId": "<uuid>",
    "integration": "WHATSAPP-BAILEYS",
    "webhookWaBusiness": null,
    "accessTokenWaBusiness": "",
    "status": "connecting"
  },
  "hash": "***REDACTED***",
  "webhook": {},
  "websocket": {},
  "rabbitmq": {},
  "nats": {},
  "sqs": {},
  "settings": { ... },
  "qrcode": {
    "pairingCode": null,
    "code": "***REDACTED*** (WA link code)",
    "base64": "data:image/png;base64,***REDACTED***",
    "count": 1
  }
}
```

Confirmado:
- `hash` é o token da instância recém-criada (aparece depois como
  `token` em `fetchInstances`).
- O QR nasce embutido na resposta do `create` quando `qrcode: true`.

---

## 4. Formato do QR (via `/instance/connect/{name}`)

`GET /instance/connect/<TMP>`

Status: `200`
Content-Type: `application/json; charset=utf-8`

Response (shape, valores redigidos):

```json
{
  "pairingCode": null,
  "code": {
    "encoding": "utf-8 string (WA linking code)",
    "length_observed": 217,
    "prefix": "2@***REDACTED***"
  },
  "base64": {
    "encoding": "data URL PNG (data:image/png;base64,...)",
    "length_observed": ~12030,
    "prefix": "data:image/png;base64,iVBORw0KGgoAAAANSU***REDACTED***"
  },
  "count": <int, incrementa a cada chamada>
}
```

Campos:
- `base64`: PNG do QR em data-URL, pronto para `<img src>`.
- `code`: string bruta do QR (útil para clientes que renderizam o próprio
  QR).
- `pairingCode`: sempre `null` neste servidor; pareamento por número
  (8 dígitos) não foi observado. Requer flag/config específica se
  desejado no futuro.
- `count`: contador de vezes que o QR foi (re)gerado nesta sessão.

### TTL do QR

Duas leituras consecutivas de `connect` com intervalo de ~35 s
retornaram valores diferentes tanto em `code` quanto no `base64`, e o
`count` incrementou. Isso confirma que o QR **rotaciona periodicamente**
dentro do próprio ciclo de connect.

TTL exato em segundos **não confirmado nesta fase** — a discovery não
mediu o menor intervalo que ainda retorna o mesmo QR nem inspecionou o
evento `QRCODE_UPDATED` em tempo real. A UI de produção deve tratar o
QR como efêmero e repolarizar via `connect` periodicamente, sem
persistir o binário.

---

## 5. Connection state

`GET /instance/connectionState/<TMP>`

Status: `200`
Response:

```json
{
  "instance": {
    "instanceName": "<TMP>",
    "state": "connecting"
  }
}
```

Estados observáveis conhecidos pela Evolution: `connecting`, `open`,
`close`. Nesta discovery apenas `connecting` foi observado (sem
pareamento por celular).

---

## 6. Fetch de uma instância específica

`GET /instance/fetchInstances?instanceName=<TMP>`

Status: `200`
Response: array com um único item cujo shape é idêntico ao descrito na
seção 2. Útil para leitura pontual sem trazer o roster completo.

---

## 7. Webhook — find (antes do set)

`GET /webhook/find/<TMP>`

Status: `200`
Content-Type: `application/json; charset=utf-8`
Body: `null`

Confirmado: instância recém-criada não tem webhook configurado por
default; endpoint responde `200 null` (não 404).

---

## 8. Webhook — set

`POST /webhook/set/<TMP>`

Body enviado:

```json
{
  "webhook": {
    "enabled": true,
    "url": "https://example.invalid/discovery",
    "webhookByEvents": false,
    "webhookBase64": false,
    "events": [
      "CONNECTION_UPDATE",
      "QRCODE_UPDATED",
      "MESSAGES_UPSERT",
      "MESSAGES_UPDATE"
    ]
  }
}
```

Status: `201`
Response:

```json
{
  "id": "<cuid>",
  "url": "https://example.invalid/discovery",
  "headers": null,
  "enabled": true,
  "events": [
    "CONNECTION_UPDATE",
    "QRCODE_UPDATED",
    "MESSAGES_UPSERT",
    "MESSAGES_UPDATE"
  ],
  "webhookByEvents": false,
  "webhookBase64": false,
  "instanceId": "<uuid>",
  "createdAt": "<iso8601>",
  "updatedAt": "<iso8601>"
}
```

### Contrato confirmado
- Envelope aceito: `{ "webhook": { ... } }`.
- Campos aceitos: `enabled`, `url`, `webhookByEvents`, `webhookBase64`,
  `events`, `headers` (retornou `null`, não testado com valor).
- Lista de eventos aceita como configuração:
  `CONNECTION_UPDATE`, `QRCODE_UPDATED`, `MESSAGES_UPSERT`,
  `MESSAGES_UPDATE`. Status `201` indica upsert bem-sucedido.

### Entrega real dos eventos
**Não confirmada nesta fase.** Nenhum webhook público foi apontado para o
Seialz, nenhum pareamento por celular foi feito, nenhuma mensagem foi
trocada. Os quatro eventos acima devem ser tratados como:

- **Configuráveis** (aceitos pela API e persistidos como acima), e
- **Entrega real não confirmada** — validar em fase posterior com um
  endpoint receptor real, dentro de janela controlada.

### Remoção do webhook
A resposta de `webhookSet` não indica um contrato explícito de deleção.
Nenhum payload de remoção foi inferido por suposição — a limpeza foi
garantida via `DELETE /instance/delete/{name}` logo em seguida.

---

## 9. Logout

`DELETE /instance/logout/<TMP>`

Status: `200`
Response:

```json
{
  "status": "SUCCESS",
  "error": false,
  "response": { "message": "Instance logged out" }
}
```

Observação: neste caso o logout foi aceito mesmo sem sessão de celular
ativa. A UI de produção deve tratar `logout` como tolerante a erro
(4xx é aceitável) e prosseguir com `delete` quando o objetivo for
descartar a instância.

---

## 10. Delete

`DELETE /instance/delete/<TMP>`

Status: `200`
Response:

```json
{
  "status": "SUCCESS",
  "error": false,
  "response": { "message": "Instance deleted" }
}
```

---

## 11. Snapshot DEPOIS (prova de remoção)

`GET /instance/fetchInstances`

Status: `200`
Resultado: array com **apenas** a instância pré-existente `dev-int`.
Comprimento do body idêntico ao snapshot ANTES (912 bytes). A instância
temporária `<TMP>` **não aparece**. Nenhuma outra alteração observada.

---

## 12. Resumo de contratos por operação

| Op | Método | Path | Sucesso | Observação |
|---|---|---|---|---|
| Server info | GET | `/` | 200 | Versão, clientName, WA web version |
| Fetch all | GET | `/instance/fetchInstances` | 200 | Array; token da instância vem embutido |
| Fetch one | GET | `/instance/fetchInstances?instanceName=X` | 200 | Array de um item |
| Create | POST | `/instance/create` | 200 | Retorna hash + qrcode embutido |
| Connect | GET | `/instance/connect/X` | 200 | Rotaciona QR; contém `code`, `base64`, `pairingCode`, `count` |
| Connection state | GET | `/instance/connectionState/X` | 200 | `state ∈ {connecting, open, close}` |
| Webhook find | GET | `/webhook/find/X` | 200 | `null` quando ausente |
| Webhook set | POST | `/webhook/set/X` | 201 | Envelope `{ webhook: {...} }`; eventos configuráveis |
| Logout | DELETE | `/instance/logout/X` | 200 | Tolerar erro se sem sessão |
| Delete | DELETE | `/instance/delete/X` | 200 | Remoção efetiva confirmada por re-list |

---

## 13. Itens ainda em aberto (para fases posteriores)

- Entrega real dos eventos de webhook contra receptor Seialz.
- Formato exato de `MESSAGES_UPSERT` / `MESSAGES_UPDATE` payloads.
- TTL numérico do QR e comportamento do evento `QRCODE_UPDATED`.
- Comportamento de reconnect após `open` (sessão de celular real).
- Contrato de mídia (upload/download) — não coberto na Fase 0.
- Rate limits do servidor Vultr.
- Comportamento de `sendText` / `sendMedia` (fora do escopo Fase 0).

---

## 14. Cleanup executado

- Instância temporária `<TMP>`: logout OK, delete OK, ausente no snapshot
  final.
- Edge Function `evolution-discovery`: apagada do projeto Supabase.
- Diretório local `supabase/functions/evolution-discovery/`: removido.
- Secret `EVOLUTION_DISCOVERY_TOKEN`: revogado.
- Único diff remanescente deste ciclo: este documento
  (`docs/integrations/evolution-api/DISCOVERY.md`).
