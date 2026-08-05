# Auditoria: heartbeat "vencido" do integration-worker

## Conclusão

**O worker roda, mas não registra heartbeat quando não há lote.** É falso positivo do monitoramento — não há incidente no outbox.

Nenhuma outra hipótese se sustenta: o worker está sendo chamado (cron ativo a cada 30s, todas as execuções `succeeded`), não está falhando (HTTP 200 em todas as respostas recentes), e não existe job pendente ou preso (a fila está vazia agora).

## Evidências

### 1. Agendamento (cron ativo e correto)

| Campo | Valor |
|---|---|
| `jobname` | `integration-worker` (jobid 5) |
| `schedule` | `30 seconds` |
| `active` | `true` |
| comando | `net.http_post` para `https://qvmtzfvkhkhkhdpclzua.supabase.co/functions/v1/integration-worker`, headers `apikey` + `Authorization: Bearer <anon>` + `X-Worker-Token` lido de `vault.decrypted_secrets` (`integration_worker_token`), `timeout_milliseconds := 25000` |

### 2. Últimas execuções do cron (`cron.job_run_details`, jobid 5)

Dez execuções mais recentes, de `16:26:34` a `16:31:04`, todas `succeeded`, `return_message = "1 row"`, sem erro. Cadência de 30s sem gaps.

### 3. Endpoint e autenticação

O worker exige `x-worker-token === INTEGRATION_WORKER_TOKEN` e devolve 401 caso contrário. As respostas reais em `net._http_response` são **HTTP 200**, o que prova que a URL está certa, a função está deployada e o token do vault casa com o secret (`INTEGRATION_WORKER_TOKEN` existe na lista de secrets). Nenhum 401/403/5xx/timeout no período.

Respostas do integration-worker (identificáveis pelo shape `summary: {success, conflict, retryable, permanent, no_handler, error}`):

```
16:31:04  200  {"ok":true,"processed":0,"durationMs":63,"summary":{...tudo 0}}
16:30:34  200  {"ok":true,"processed":0,"durationMs":50,"summary":{...tudo 0}}
16:30:08  200  {"ok":true,"processed":0,"durationMs":46,"summary":{...tudo 0}}
16:29:34  200  {"ok":true,"processed":0,"durationMs":52,"summary":{...tudo 0}}
16:29:04  200  {"ok":true,"processed":0,"durationMs":93,"summary":{...tudo 0}}
```

Atenção a uma armadilha de leitura: as respostas vizinhas com `processed:12`, `batches`, `circuit_breaker` e `platform_rate_limit` **não são** do integration-worker — esse shape só existe em `supabase/functions/intelligence-worker/index.ts`. Elas compartilham o mesmo minuto e enganam quem olha `net._http_response` sem separar por função.

### 4. Logs da Edge Function

`integration-worker`: `booted (time: 30ms)` e `shutdown`, sem erros, sem 401/403, sem 5xx, sem timeout. Compatível com invocações curtas que encontram fila vazia.

### 5. Fila

```sql
select ... from integration_jobs where status in ('pending','running')  -->  0 linhas
```

Não há job pendente nem em execução no momento da auditoria (o `pending = 1` observado antes já foi consumido). Portanto não existe caso de "job pendente não elegível".

### 6. Causa comprovada

`supabase/functions/integration-worker/index.ts`:

- linha 56: `if (claimed.length === 0) break;` — sem jobs, o loop encerra imediatamente;
- linhas 228-245: o `insert` em `integration_audit_logs` com `actor: "integration-worker"` está **dentro de `persistResult`**, que só é chamado por `processJob`, ou seja, **uma vez por job processado**.

Logo, um ciclo com `processed: 0` não escreve nenhuma linha de auditoria. E `fn_outbox_health_summary_internal()` calcula:

```sql
'worker_last_run_at', (SELECT max(created_at) FROM integration_audit_logs WHERE actor='integration-worker')
```

Isto é, o "heartbeat" é derivado de **evidência de trabalho**, não de evidência de vida. Em fila vazia, `worker_last_run_at` congela no último job processado (`16:04:04`, que é também o `max(created_at)` de toda a tabela) e o `service-health` classifica `critical` por heartbeat > 15 min — exatamente o que aconteceu.

Contraste que confirma o desenho: o `inbox-reaper` tem heartbeat real em `outbox_system_heartbeats` (`component='reaper'`, `last_run_at = 16:32:00`, `last_detail = {"reaped": 0}`) — ele grava mesmo com zero trabalho, e por isso nunca dá falso positivo.

## Correção proposta (não implementada)

Alinhar o outbox ao padrão que já funciona no reaper, sem tocar em cron, token ou função de saúde:

1. No fim de cada invocação do `integration-worker`, gravar `outbox_system_heartbeats` com `component = 'integration-worker'`, `last_run_at = now()` e `last_detail = { processed, durationMs, summary }` — inclusive quando `processed = 0`.
2. Apontar `worker_last_run_at` em `fn_outbox_health_summary_internal()` para esse heartbeat, deixando `integration_audit_logs` como trilha de trabalho por job (não como sinal de vida).
3. Manter as regras de status atuais do `service-health` (`stuck5m > 0` ou `deadLetter24h > 0` → critical), que já estão corretas.

Efeito esperado: fila vazia passa a ser `healthy`, e `critical` por heartbeat volta a significar worker realmente parado.
