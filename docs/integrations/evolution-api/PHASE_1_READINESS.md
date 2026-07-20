# Evolution API — Fase 1: Relatório de Prontidão de Infraestrutura

Data: 2026-07-20
Escopo: infraestrutura e prontidão operacional do servidor Evolution v2.3.7
auto-hospedado (Vultr, IP `216.238.113.44`).
Fonte de contratos: `DISCOVERY.md` (Fase 0, aprovada).

Este documento é apenas diagnóstico + plano. **Nenhuma mudança foi executada.**
Nada foi alterado no Seialz, no banco, em Meta/Twilio, em `messaging_lines`,
em `communication_endpoints`, nem na instância `dev-int`.

---

## 0. Limitação de acesso desta fase

O agente Lovable **não possui acesso SSH ao host Vultr, nem ao painel Vultr,
nem ao DNS do domínio-alvo**. Portanto, os itens abaixo se dividem em duas
categorias, sempre marcadas:

- **[CONFIRMADO]** — evidenciado na Fase 0 via HTTP contra o servidor real.
- **[REQUER OPERADOR]** — depende de ação/checagem no host Vultr, no
  registrador DNS, ou no gestor de secrets. Não é possível confirmar via
  Lovable.

Todo item `[REQUER OPERADOR]` está descrito com o procedimento exato a
executar, para que a operação seja feita fora do Lovable e o resultado
registrado neste mesmo documento na revisão.

---

## 1. Estado atual confirmado

| Item | Estado | Fonte |
|---|---|---|
| Servidor responde | HTTP 200 em `GET /` | Fase 0 §1 |
| Versão Evolution | `2.3.7` | Fase 0 §1 |
| `clientName` | `evolution_divus` | Fase 0 §1 |
| Endpoint atual | `http://216.238.113.44` (IP puro, HTTP) | Config Fase 0 |
| TLS | **Ausente** — hoje é HTTP simples | Config Fase 0 |
| Domínio próprio | **Não definido** | — |
| `/manager` | Referenciado em `GET /` como `http://***/manager` — **exposto publicamente** na mesma porta | Fase 0 §1 |
| Instância existente | `dev-int`, `connectionStatus: connecting`, não tocada | Fase 0 §2 |
| Autenticação de API | header `apikey` (global) aceita | Fase 0 (todas as ops) |
| Webhook events | `CONNECTION_UPDATE`, `QRCODE_UPDATED`, `MESSAGES_UPSERT`, `MESSAGES_UPDATE` — **configuráveis, entrega real não confirmada** | Fase 0 §8 |

Itens não observáveis via HTTP externo (portas efetivas, firewall, volumes,
processo de backup, versões de Postgres/Redis, política de restart) estão
todos em `[REQUER OPERADOR]` abaixo.

---

## 2. Objetivos da Fase 1 — status por item

### 2.1 Domínio HTTPS definitivo

- Estado: **pendente**. Hoje o Seialz aponta para IP puro em HTTP.
- Ação requerida (operador):
  1. Escolher o FQDN (sugestão: `evo.seialz.com` ou subdomínio
     dedicado tipo `wa-evo.seialz.com`).
  2. Criar registro `A evo.seialz.com → 216.238.113.44` no DNS.
  3. Escolher terminador TLS:
     - **Opção A (recomendada):** Caddy ou Nginx no próprio host,
       com Let's Encrypt (HTTP-01 ou DNS-01). Simples, sem custo.
     - **Opção B:** Cloudflare em modo proxy. Adiciona uma camada
       de terceiro entre Seialz e Evolution. Não recomendado no MVP
       (mais superfícies de falha, cookies/scanner podem reportar
       região errada — mesmo caveat já documentado para domínios
       proxied em Lovable).
  4. Após TLS ativo, definir `EVOLUTION_BASE_URL = https://<fqdn>`
     como novo valor canônico do secret (ver §7).
- Critério de aceite: `curl -sSf https://<fqdn>/` retorna JSON com
  `version: "2.3.7"` **sem** `-k`.

### 2.2 Validação de certificado TLS

- Ação requerida (operador), após 2.1:
  ```
  openssl s_client -connect <fqdn>:443 -servername <fqdn> </dev/null 2>/dev/null \
    | openssl x509 -noout -subject -issuer -dates
  ```
- Critério de aceite:
  - `notAfter` ≥ hoje + 30 dias;
  - `subject` inclui `<fqdn>`;
  - renovação automática (Caddy) ou cron de `certbot renew` ativo;
  - HSTS opcional na Fase 1, obrigatório antes do piloto (Fase 5).

### 2.3 Proteger `/manager`

- Risco atual: `/manager` é servido no mesmo host/porta da API, sem
  restrição pública documentada. Se acessível via internet, qualquer
  um com a apikey global tem UI administrativa completa.
- Alternativas (a decidir pelo operador):
  - **A. Bloquear via reverse proxy** (recomendado): no Caddy/Nginx,
    `location /manager` responde 403 para tudo que não venha de uma
    allowlist de IPs de escritório/VPN.
  - **B. Basic Auth adicional** no reverse proxy sobre `/manager`.
  - **C. Bind local**: rodar o serviço em `127.0.0.1` e expor apenas
    `/message/*`, `/instance/*`, `/webhook/*`, `/` via proxy — bloqueando
    `/manager` inteiramente. Requer validar que a lista de rotas
    necessárias está fechada (nossa `DISCOVERY.md` cobre o essencial).
- Critério de aceite: `curl -sS -o /dev/null -w "%{http_code}\n"
  https://<fqdn>/manager` de um IP fora da allowlist retorna `401`
  ou `403`.

### 2.4 Portas expostas e firewall

- `[REQUER OPERADOR]`. No host Vultr:
  ```
  ss -tlnp | awk 'NR==1 || $4 ~ /:(80|443|8080|5432|6379)$/'
  ufw status verbose      # ou: iptables -S; nft list ruleset
  ```
- Alvo de Fase 1:
  - `80/tcp` aberto ao mundo (redirect 301 → 443, ou ACME HTTP-01).
  - `443/tcp` aberto ao mundo.
  - `22/tcp` aberto **apenas** à allowlist de administradores.
  - `5432/tcp` (Postgres), `6379/tcp` (Redis), portas internas do
    container Evolution — **fechadas** ao mundo, acessíveis apenas
    dentro da rede Docker/loopback.
- Critério de aceite: `nmap -Pn -p- <fqdn>` de fora mostra apenas
  22 (restrito), 80, 443.

### 2.5 Persistência de volumes (Postgres e Redis)

- `[REQUER OPERADOR]`. No host:
  ```
  docker compose config | grep -A2 volumes:
  docker volume ls
  docker volume inspect <postgres_vol> <redis_vol>
  ```
- Alvo:
  - Volumes nomeados (não `tmpfs`), montados em caminho estável
    do host (ex.: `/var/lib/evolution/postgres`).
  - `docker compose down && docker compose up -d` **não** deve
    recriar os volumes.
- Critério de aceite: procedimento §2.6 abaixo executado com sucesso.

### 2.6 Reinicialização do stack sem perda de `dev-int`

- `[REQUER OPERADOR]`. Procedimento:
  1. Snapshot pré-restart:
     `curl -sS -H "apikey: $KEY" https://<fqdn>/instance/fetchInstances > /tmp/pre.json`
  2. `docker compose restart` (ou `down && up -d`).
  3. Aguardar readiness: loop até `curl -sSf https://<fqdn>/` retornar 200.
  4. Snapshot pós-restart:
     `curl -sS -H "apikey: $KEY" https://<fqdn>/instance/fetchInstances > /tmp/pos.json`
  5. `diff <(jq -S . /tmp/pre.json) <(jq -S . /tmp/pos.json)` deve ser
     vazio exceto por `updatedAt` de campos triviais.
- Critério de aceite: `dev-int` presente no snapshot pós com o mesmo
  `id`, `token` e `Setting.id`.

### 2.7 Backup mínimo e restauração

- `[REQUER OPERADOR]`. Proposta MVP (sem custo adicional relevante):
  - **Dump diário do Postgres** dentro do container:
    ```
    docker exec <pg_container> pg_dump -U <user> -Fc <db> \
      > /var/backups/evolution/pg_$(date +%F).dump
    ```
    via cron do host, retenção mínima 7 dias.
  - **Snapshot semanal do volume Redis** (opcional; Redis aqui
    guarda estado transitório de sessão — não é fonte de verdade).
  - **Off-host**: espelhar `/var/backups/evolution/` para
    Vultr Object Storage, S3 ou rsync para outro host. Sem cópia
    externa, um único disco corrompido perde tudo.
- Restauração — ensaio obrigatório antes de liberar a Fase 2:
  1. Provisionar host descartável.
  2. Subir o mesmo `docker-compose.yml`.
  3. `pg_restore -U <user> -d <db> pg_<data>.dump`.
  4. `GET /instance/fetchInstances` retorna a lista esperada.
- Critério de aceite: um ensaio de restauração documentado neste
  mesmo arquivo (data, dump usado, resultado).

### 2.8 Armazenamento dos secrets Evolution

- Alvo canônico (compatível com o padrão já em uso no projeto):
  - `EVOLUTION_BASE_URL` — **Supabase Edge Function Secret** do
    projeto Seialz. Não é sensível por si, mas é operacional e deve
    seguir a mesma origem do `EVOLUTION_GLOBAL_API_KEY`.
  - `EVOLUTION_GLOBAL_API_KEY` — **Supabase Edge Function Secret**,
    escopo backend. **Nunca** exposto ao frontend, nunca no
    repositório, nunca em `.env` commitado, nunca ecoado em log.
- Ambos serão criados apenas quando a Fase 2 começar (nada é
  gravado nesta fase). O `EVOLUTION_DISCOVERY_TOKEN` da Fase 0 já
  foi revogado.
- Confirmação em produção: `fetch_secrets` do projeto Seialz na
  abertura da Fase 2 deve listar exatamente esses dois nomes, sem
  variantes.

### 2.9 Rotação da API key administrativa

- Contexto: a Evolution v2.3.7 usa uma única `AUTHENTICATION_API_KEY`
  global no `.env` do container. Não há endpoint documentado de
  rotação sem restart.
- Procedimento de rotação (a executar quando necessário, não agora):
  1. Gerar novo valor (256 bits, gestor de senhas).
  2. Editar `.env` do stack no host, `AUTHENTICATION_API_KEY=<novo>`.
  3. `docker compose up -d` (recreate do container da API).
  4. Atualizar `EVOLUTION_GLOBAL_API_KEY` no Supabase via
     `update_secret`.
  5. Redeploy das Edge Functions que a consomem (a partir da Fase 3).
- Política mínima proposta: rotação **sob evento** (suspeita de
  vazamento, saída de administrador) + rotação **calendarizada**
  a cada 180 dias. Sem rotação automática no MVP.
- Janela de indisponibilidade da rotação: ~5–10s de recreate.
  Aceitável fora do horário comercial.

### 2.10 Tratamento de status ("último estado conhecido")

- Premissa herdada da Fase 0: o webhook `CONNECTION_UPDATE` é
  **configurável mas não teve entrega confirmada** em runtime.
  Portanto, no MVP, o Seialz **não pode prometer tempo real** para
  o estado da instância.
- Modelo proposto para o MVP (a implementar somente a partir da
  Fase 3, aqui só definido):
  - Poll ativo via `GET /instance/connectionState/{name}` com
    cadência conservadora (ex.: a cada 30s por instância em
    `connecting`; a cada 5 min em `open`; sob demanda ao abrir a
    tela). Números concretos serão validados na Fase 3.
  - Persistir no Seialz apenas: `last_known_state`,
    `last_state_checked_at`. **Nunca** persistir QR base64.
  - UI: rotular explicitamente como "Último estado conhecido:
    `<state>` — verificado há Xs". Botão "Verificar agora" dispara
    um poll pontual.
  - Quando/se o webhook de `CONNECTION_UPDATE` for validado em
    runtime numa fase posterior, o poll pode ser reduzido, mas o
    rótulo "último estado conhecido" permanece — é honesto.

---

## 3. Mudanças necessárias (resumo executável)

1. **DNS**: `A <fqdn> → 216.238.113.44`.
2. **Reverse proxy no host** (Caddy recomendado):
   - TLS Let's Encrypt automático.
   - `location /` → Evolution API interna.
   - `location /manager` → 403 fora da allowlist.
3. **Firewall**: só 22 (allowlist), 80, 443 públicos.
4. **Backup**: cron diário `pg_dump` + cópia off-host.
5. **Ensaio de restore**: uma vez, documentado.
6. **Secrets** (Seialz, no início da Fase 2):
   `EVOLUTION_BASE_URL`, `EVOLUTION_GLOBAL_API_KEY`.
7. **Política de rotação** da API key registrada (180d + sob evento).
8. **Contrato de status** documentado como "último estado conhecido".

Nada acima toca Seialz, Meta, Twilio, `messaging_lines`,
`communication_endpoints` ou `dev-int`.

---

## 4. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Migrar de `http://IP` para `https://fqdn` quebra clientes que ainda usem o IP | Alto | Nenhum cliente Seialz consome Evolution hoje; a Fase 0 usou um secret temporário que foi revogado. Baixo risco efetivo. |
| `/manager` exposto durante a janela de configuração | Alto | Aplicar bloqueio no proxy **antes** de publicar o FQDN no DNS público, ou publicar DNS já com regra ativa. |
| Volume Postgres em `tmpfs` ou path efêmero | Crítico (perde `dev-int`) | Item 2.5: inspecionar antes de qualquer restart. |
| Renovação Let's Encrypt falha silenciosa | Médio | Monitorar `notAfter` semanalmente; alerta ≤ 14 dias. |
| Rotação de API key sem redeploy das funções | Alto | Checklist §2.9 exige update do secret + redeploy no mesmo procedimento. |
| Webhook de status assumido como confiável cedo demais | Médio | Contrato "último estado conhecido" fixado desde já (§2.10). |
| Dump com senha em texto claro em `/var/backups` | Médio | Backup off-host em bucket com SSE + acesso restrito; permissões 600 no host. |

---

## 5. Rollback

Cada mudança da Fase 1 é reversível de forma independente:

- **DNS**: remover o registro A do FQDN. Retorna ao estado "sem
  domínio". Seialz continua sem consumir Evolution (Fases 3+ não
  começaram).
- **Reverse proxy**: `docker compose stop caddy` (ou `systemctl stop
  caddy`) e reabrir a porta original. Volta a servir HTTP direto.
- **Firewall**: `ufw reset` para o estado prévio, documentado no
  snapshot pré-mudança do `ufw status verbose`.
- **Backup cron**: `crontab -r` da entrada específica.
- **Secrets Seialz**: nesta fase nada é gravado; nada a reverter.
- **Rotação de API key**: manter o valor antigo em cofre por 24h
  para reverter `.env` + `docker compose up -d` se necessário.

Nenhuma dessas ações afeta `dev-int` desde que o item §2.5 esteja
confirmado.

---

## 6. Bloqueadores para iniciar a Fase 2

Fase 2 (banco/aditivo) só pode começar quando **todos** os itens
abaixo estiverem verdes:

- [ ] FQDN definido e publicado (`A` no DNS resolve para o IP).
- [ ] `https://<fqdn>/` responde 200 com JSON `version 2.3.7`,
      certificado válido, sem `-k`.
- [ ] `https://<fqdn>/manager` responde 401/403 de um IP fora da
      allowlist.
- [ ] `nmap -Pn <fqdn>` mostra apenas 80/443 (+ 22 restrito).
- [ ] Volumes de Postgres e Redis confirmados como persistentes
      (paths nomeados, inspeção documentada).
- [ ] Restart do stack executado e `dev-int` intacta no snapshot
      pós.
- [ ] Backup diário rodando, com pelo menos um ensaio de restore
      documentado.
- [ ] `EVOLUTION_BASE_URL` e `EVOLUTION_GLOBAL_API_KEY` prontos
      para serem gravados como Supabase Edge Function Secrets
      (valores em cofre, ainda não gravados — a gravação abre a
      Fase 2).
- [ ] Procedimento de rotação da API key registrado neste
      documento e aceito pelo owner.
- [ ] Contrato de status "último estado conhecido" aceito pelo
      owner como comportamento oficial do MVP.

---

## 7. Checklist objetivo de liberação

```
[  ] DNS A <fqdn> → 216.238.113.44
[  ] TLS válido (issuer LE, notAfter ≥ +30d)
[  ] /manager bloqueado publicamente
[  ] Firewall: 22 restrito, 80/443 abertos, resto fechado
[  ] Volumes Postgres/Redis persistentes confirmados
[  ] Restart do stack sem perda de dev-int (evidência anexada)
[  ] Backup diário ativo + 1 ensaio de restore documentado
[  ] Secrets prontos para serem gravados na Fase 2
[  ] Política de rotação da API key registrada
[  ] "Último estado conhecido" aceito como contrato do MVP
```

Quando os 10 itens estiverem marcados, este documento deve ser
atualizado com data, autor da verificação e evidências (saídas de
comando redigidas). Só então a Fase 2 pode ser aberta.

---

## 8. Fora do escopo desta fase

- Qualquer migration no Seialz.
- Criação das Edge Functions definitivas da Evolution.
- Dispatcher, provider registry, UI, feature flags.
- Piloto Viagi.
- Qualquer alteração em Meta, Twilio, `messaging_lines`,
  `communication_endpoints` ou na instância `dev-int`.
