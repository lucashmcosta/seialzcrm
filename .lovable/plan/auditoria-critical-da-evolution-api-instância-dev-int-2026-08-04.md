# Auditoria: `critical` da Evolution API (instância `dev-int`)

## Conclusão

**A instância está realmente desconectada no servidor Evolution.** O `critical` é verdadeiro — não é estado stale, não é webhook parado, não é falha de persistência.

Duas causas secundárias, reais mas não responsáveis pelo alerta:

- **Não existe health check/cron de Evolution** — o estado no Seialz só é atualizado por webhook ou por ação manual na UI. Por isso `last_state_checked_at` está parado em 03/08 17:59.
- **Mapeamento de estado incompleto** no webhook: o estado terminal recebido foi `refused`, que não está no `switch` e cai em `unknown`. O banco registra `unknown` onde deveria registrar `close`.

## Evidências

### 1. Estado real no servidor Evolution (leitura direta, sem alterar nada)

```
GET /instance/connectionState/dev-int   200  {"instance":{"instanceName":"dev-int","state":"close"}}

GET /instance/fetchInstances            200
  name: dev-int
  connectionStatus: connecting
  ownerJid: 5511936198439@s.whatsapp.net   (o 8439)
  profileName: Marlisa Mano
  disconnectionReasonCode: 403
  disconnectionAt: 2026-07-30T14:30:35.545Z
  _count: { Message: 7804, Contact: 1706, Chat: 386 }
```

A sessão Baileys caiu em **30/07 14:30** com motivo **403** (sessão invalidada pelo WhatsApp — desvinculada no aparelho ou substituída). `state: close` é o estado atual; `connectionStatus: connecting` é resíduo da tentativa de reconexão de 03/08.

### 2. Linha do tempo dos eventos (`integration_inbound_events`, `integration_slug = 'evolution_api'`)

| Evento | Qtde | Primeiro | Último |
|---|---|---|---|
| `messages.upsert` (processed) | 976 | 28/07 03:31 | **30/07 14:24** |
| `messages.update` (failed) | 5999 | 20/07 22:58 | 30/07 14:24 |
| `qrcode.updated` (processed) | 31 | 03/08 17:38 | 03/08 17:59 |
| `connection.update` (processed) | 42 | 28/07 17:14 | **03/08 17:59:14** |

Tráfego de mensagens cessa exatamente em 30/07 14:24, minutos antes do `disconnectionAt` 14:30 — coerente com a queda da sessão.

### 3. Último `CONNECTION_UPDATE` recebido (03/08 17:59:14)

```json
{ "instance": "dev-int", "state": "refused", "statusReason": 428,
  "wuid": "5511936198439@s.whatsapp.net" }
```

E o `qrcode.updated` do mesmo segundo:

```json
{ "message": "QR code limit reached, please login again", "statusCode": 500 }
```

Ou seja: em 03/08 houve uma tentativa de reconexão por QR (31 QR codes em ~21 min) que **falhou por limite de QR**, terminando em `refused`. Desde então ninguém reescaneou, e a instância permanece sem sessão. Nenhum evento Evolution chegou depois disso — o silêncio é *consequência* da falta de sessão, não a causa.

### 4. Estado persistido no Seialz vs. real

| Campo (`evolution_instances`) | Valor |
|---|---|
| `instance_name` / `instance_id_remote` | `dev-int` |
| `last_known_state` | **`unknown`** (real: `close`) |
| `last_state_checked_at` | 2026-08-03 17:59:14 |
| `last_qr_expires_at` | 2026-08-03 18:00:14 |
| `endpoint_id` | `11111111-…-000000000001` |

Divergência de rótulo, não de fato: ambos indicam "sem sessão". Causa em `supabase/functions/evolution-webhook/index.ts:990-994` — o mapeamento cobre `open/connected`, `connecting/qr/pairing`, `close/closed/disconnected/logout`, e cai em `unknown` para qualquer outro; `refused` não está previsto.

O `service-health` conta `instancesOpen` por `last_known_state = 'open'` (`supabase/functions/service-health/index.ts:235`), então `unknown` e `close` produzem o mesmo `0 de 1` → `critical`. O alerta está correto por acidente: acertou a conclusão com o rótulo errado.

### 5. Webhook na instância — configurado e ativo (não é a causa)

```
GET /webhook/find/dev-int   200
  enabled: true
  url: https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/evolution-webhook
  events: MESSAGES_UPSERT, MESSAGES_UPDATE, CONNECTION_UPDATE, QRCODE_UPDATED
  header de autenticação presente e correto
  webhookBase64: true
```

URL, eventos e segredo estão certos. Os eventos de 03/08 chegaram e foram processados (`process_status = processed`), provando que o caminho webhook → Seialz funciona.

### 6. Health check / cron

`cron.job` tem 18 jobs ativos (meta, marketing, integration-worker, intelligence, telephony, reapers). **Nenhum job de Evolution.** Também não existe função de health check de instância no projeto: o estado só é escrito por `evolution-webhook` (`applyStateEvent`) ou por operações manuais de `evolution-instance-manager` disparadas pela UI.

### 7. Notas de verificação

- `evolution-webhook` não tem logs recentes na plataforma — consistente com zero requisições desde 03/08.
- `evolution-instance-manager` com `op=connectionState` retornou **401 UNAUTHORIZED** na chamada de teste (exige JWT de usuário; a sessão de preview é `external_unmanaged`). Isso é limitação do ambiente de auditoria, **não** um defeito da função — a leitura foi feita direto no servidor Evolution.

## Classificação final

**Instância realmente desconectada** (sessão invalidada com motivo 403 em 30/07; reconexão por QR falhou em 03/08 por limite de QR), com dois defeitos colaterais comprovados: **health check ausente** e **`refused` não mapeado** (persiste `unknown` em vez de `close`).

## Correções candidatas (não implementadas)

1. Mapear `refused` (e `logged_out` / `banned`, se aparecerem) para `close` no `extractConnectionState`, para o banco refletir o estado real.
2. Health check periódico de instâncias Evolution (cron → `connectionState` por instância), atualizando `last_known_state` e `last_state_checked_at` mesmo sem webhook — hoje uma instância morta silenciosamente só é notada pelo alerta de `instancesOpen = 0`.
3. Distinguir no `service-health` "estado desatualizado" (`last_state_checked_at` antigo) de "instância fora do ar" (`close`), para o Kairos saber qual é qual.

Restaurar a operação do número 8439 exige **reescanear o QR** — ação humana no aparelho, fora do escopo de qualquer correção de código.
