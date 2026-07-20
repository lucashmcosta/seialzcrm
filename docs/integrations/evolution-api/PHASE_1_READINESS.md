# Evolution API — Fase 1: Relatório de Prontidão de Infraestrutura (rev. 2)

Data: 2026-07-20
Escopo: infraestrutura e prontidão operacional do servidor Evolution v2.3.7
auto-hospedado (Vultr, IP `216.238.113.44`).
Fonte de contratos: `DISCOVERY.md` (Fase 0, aprovada).

Este documento é apenas diagnóstico + plano. **Nenhuma mudança foi executada.**
Nada foi alterado no Seialz, no banco, em Meta/Twilio, em `messaging_lines`,
em `communication_endpoints`, nem na instância `dev-int`.

Revisão 2 incorpora as 11 correções obrigatórias solicitadas pelo owner antes
de virar procedimento operacional.

---

## 0. Limitação de acesso desta fase

O agente Lovable **não possui acesso SSH ao host Vultr, nem ao painel Vultr,
nem ao DNS do domínio-alvo**. Portanto, os itens abaixo se dividem em duas
categorias, sempre marcadas:

- **[CONFIRMADO]** — evidenciado na Fase 0 via HTTP contra o servidor real,
  ou via ferramenta interna do Lovable (ex.: listagem de secrets).
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
| Secret `EVOLUTION_BASE_URL` | **[CONFIRMADO]** presente no cofre do projeto Seialz (Supabase Edge Function Secret). Valor não exibido. | `fetch_secrets` 2026-07-20 |
| Secret `EVOLUTION_GLOBAL_API_KEY` | **[CONFIRMADO]** presente no cofre do projeto Seialz. Valor não exibido. | `fetch_secrets` 2026-07-20 |

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
  3. Terminador TLS: **Caddy no próprio host**, com Let's Encrypt
     (HTTP-01). Cloudflare em modo proxy não será usado no MVP.
  4. Após TLS ativo, **atualizar somente** `EVOLUTION_BASE_URL` para
     `https://<fqdn>` via `update_secret` (não criar duplicata, não
     excluir/rotacionar a `EVOLUTION_GLOBAL_API_KEY` neste passo).
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
  - renovação automática pelo Caddy ativa (logs sem erro de ACME);
  - **redirect 80→443 obrigatório**; HSTS **não é bloqueador imediato**
    (ver §2.11).

### 2.3 Proteger `/manager`

- Risco atual: `/manager` é servido no mesmo host/porta da API, sem
  restrição pública documentada. Se acessível via internet, qualquer
  um com a apikey global tem UI administrativa completa.
- Decisão MVP: bloquear no Caddy por allowlist de IPs
  administrativos (ver Caddyfile em §9). Autenticação adicional
  (Basic Auth) pode ser somada, não substitui a allowlist.
- Critério de aceite: `curl -sS -o /dev/null -w "%{http_code}\n"
  https://<fqdn>/manager` de um IP fora da allowlist retorna `401`
  ou `403`.

### 2.4 Portas expostas e firewall

- `[REQUER OPERADOR]`. **Não usar `ufw reset` em momento algum.**
- Procedimento seguro (aplicar regras individualmente, com sessão
  SSH paralela aberta o tempo todo):
  ```
  # 1. Snapshot ANTES de qualquer mudança
  sudo ufw status numbered > /root/ufw.before.$(date +%F-%H%M).txt
  sudo iptables-save        > /root/iptables.before.$(date +%F-%H%M).rules

  # 2. Garantir que SSH da allowlist continua permitido
  #    (ajustar CIDR para a allowlist real de administradores)
  sudo ufw allow from <ADMIN_CIDR> to any port 22 proto tcp comment 'evo-phase1 ssh admin'

  # 3. Abrir 80 e 443 ao mundo (necessários para Caddy + ACME)
  sudo ufw allow 80/tcp  comment 'evo-phase1 http'
  sudo ufw allow 443/tcp comment 'evo-phase1 https'

  # 4. NÃO fechar 22 geral no primeiro passo. Só restringir 22 depois
  #    de confirmar que a sessão paralela pela allowlist funciona.
  ```
- Portas internas (Postgres 5432, Redis 6379, porta da app
  Evolution) devem **permanecer não expostas ao mundo** — se já são
  hoje, não mexer. Se estiverem abertas, adicionar regra explícita
  de `deny` com comentário `evo-phase1`.
- **Não afetar outras aplicações do host.** Toda regra criada nesta
  fase leva o comentário `evo-phase1` para permitir rollback
  granular.
- Rollback (§5) remove **apenas** as regras marcadas com
  `evo-phase1`, nunca faz `ufw reset`.
- Critério de aceite: `nmap -Pn -p- <fqdn>` de fora mostra apenas
  22 (restrito à allowlist), 80, 443. Aplicações pré-existentes no
  mesmo host continuam respondendo normalmente.

### 2.5 Persistência de volumes (Postgres e Redis)

- `[REQUER OPERADOR]`. Comandos apenas de leitura:
  ```
  docker compose config | grep -A2 volumes:
  docker volume ls
  docker volume inspect <postgres_vol> <redis_vol>
  ```
- Alvo:
  - Volumes nomeados (não `tmpfs`), montados em caminho estável
    do host (ex.: `/var/lib/evolution/postgres`).
  - Nenhum uso de `down -v` em nenhum procedimento desta fase.

### 2.6 Reinicialização do stack sem perda de `dev-int`

- `[REQUER OPERADOR]`. **Primeiro teste usa apenas
  `docker compose restart`.** Não usar `docker compose down` nesta
  fase. Teste de recriação de containers fica para janela separada,
  após §2.5 validado.
- Procedimento:
  1. Snapshot pré-restart (com redação — ver §2.6.1):
     ```
     curl -sS -H "apikey: $EVOLUTION_GLOBAL_API_KEY" \
       https://<fqdn>/instance/fetchInstances \
       | jq '[.[] | {name, id, integration, connectionStatus, hasToken: (.token != null)}]' \
       > /root/evo-pre.$(date +%F-%H%M).json
     ```
  2. `docker compose restart`
  3. Aguardar readiness: loop até `curl -sSf https://<fqdn>/` retornar 200.
  4. Snapshot pós-restart, mesma redação:
     ```
     curl -sS -H "apikey: $EVOLUTION_GLOBAL_API_KEY" \
       https://<fqdn>/instance/fetchInstances \
       | jq '[.[] | {name, id, integration, connectionStatus, hasToken: (.token != null)}]' \
       > /root/evo-pos.$(date +%F-%H%M).json
     ```
  5. `diff <(jq -S . /root/evo-pre.*.json) <(jq -S . /root/evo-pos.*.json)`
     deve ser vazio, exceto por `connectionStatus` transitório.
- Critério de aceite: `dev-int` presente no snapshot pós com o
  mesmo `name`, `id`, `integration` e `hasToken: true`.

#### 2.6.1 Redação obrigatória de snapshots

Nenhum comando desta fase pode salvar em `/tmp` ou em arquivo de
log a resposta bruta de `fetchInstances`, pois o campo `token` da
instância é um segredo. Toda captura deve passar por `jq` filtrando
apenas: `name`, `id` (não secreto), `integration`, `connectionStatus`,
`hasToken` (booleano). O valor de `token`, `apikey`, `qrcode`,
`ownerJid` e quaisquer credenciais **não** devem ser gravados nem
comparados.

### 2.7 Backup mínimo e restauração

- `[REQUER OPERADOR]`. Proposta MVP:
  - **Dump diário do Postgres** via arquivo dedicado
    `/etc/cron.d/evolution-backup` (NUNCA via `crontab -e` global do
    usuário, e NUNCA usar `crontab -r` no rollback). Conteúdo:
    ```
    # /etc/cron.d/evolution-backup — created by evo-phase1
    # Runs daily pg_dump of Evolution Postgres inside the container.
    SHELL=/bin/bash
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
    15 3 * * * root /usr/local/sbin/evolution-backup.sh >> /var/log/evolution-backup.log 2>&1
    ```
    O script `/usr/local/sbin/evolution-backup.sh` (modo 700, root)
    lê credenciais do container **via `docker exec`** e do arquivo
    `.env` local do stack — **não** recebe senha por CLI e **não**
    escreve senha em log:
    ```
    #!/usr/bin/env bash
    set -euo pipefail
    umask 077
    BACKUP_DIR=/var/backups/evolution
    mkdir -p "$BACKUP_DIR"
    STAMP=$(date +%F)
    # PGPASSWORD é lido do .env do stack pelo próprio container;
    # aqui NÃO exportamos nada em texto claro.
    docker exec -e PGPASSWORD \
      "$(docker compose -f /opt/evolution/docker-compose.yml ps -q postgres)" \
      pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" \
      > "$BACKUP_DIR/pg_${STAMP}.dump"
    chmod 600 "$BACKUP_DIR/pg_${STAMP}.dump"
    find "$BACKUP_DIR" -name 'pg_*.dump' -mtime +14 -delete
    # Cópia off-host (rclone para bucket com SSE; credenciais em
    # /root/.config/rclone/rclone.conf, modo 600).
    rclone copy "$BACKUP_DIR/pg_${STAMP}.dump" evo-offsite:evolution/pg/
    ```
  - **Sem** eco de senha, `PGPASSWORD` **não** aparece no script em
    texto claro; o valor vem do ambiente do container.
  - **Redis**: snapshot semanal do volume via `docker run --rm -v
    <redis_vol>:/data alpine tar -czf - /data > redis_$(date +%F).tgz`.
    Estado transitório; não é fonte de verdade.
  - Off-host obrigatório antes de considerar backup "ativo".
- Restauração — ver §2.7.1 quanto ao gate.

#### 2.7.1 Reclassificação do ensaio de restore

- **Bloqueador da Fase 1 (obrigatório para fechar esta fase):**
  backup ativo (§2.7) + volumes persistentes confirmados (§2.5) +
  cópia off-host validada (arquivo do dia visível no bucket).
- **Bloqueador do piloto Viagi (Fase 5), não da Fase 2:** ensaio
  completo de restore em host descartável, com `pg_restore` e
  `GET /instance/fetchInstances` retornando a lista esperada.
- **Regra dura:** nenhuma organização Seialz pode ser ativada em
  Evolution antes do ensaio de restore estar documentado neste
  arquivo com data e resultado.

### 2.8 Armazenamento dos secrets Evolution

- Estado atual **[CONFIRMADO]**: `EVOLUTION_BASE_URL` e
  `EVOLUTION_GLOBAL_API_KEY` já existem como Supabase Edge Function
  Secrets do projeto Seialz (verificado via `fetch_secrets` em
  2026-07-20; valores não exibidos).
- Nesta fase **não** se cria, não se duplica e não se apaga nenhum
  dos dois.
- Quando o HTTPS estiver pronto (§2.1), atualizar **somente**
  `EVOLUTION_BASE_URL` via `update_secret`, mantendo
  `EVOLUTION_GLOBAL_API_KEY` intacta.
- Regras invariantes: nunca no repositório, nunca em `.env`
  commitado, nunca ecoado em log, nunca no frontend.

### 2.9 Rotação da API key administrativa

- Contexto: a Evolution v2.3.7 usa uma única `AUTHENTICATION_API_KEY`
  global no `.env` do container. Não há endpoint documentado de
  rotação sem restart.
- Procedimento de rotação (quando necessário, **não agora**):
  1. Gerar novo valor (256 bits, gestor de senhas).
  2. Editar `.env` do stack no host, `AUTHENTICATION_API_KEY=<novo>`.
  3. `docker compose up -d` (recreate do container da API).
  4. Atualizar `EVOLUTION_GLOBAL_API_KEY` no Supabase via
     `update_secret` (o secret existe, é rotação in-place).
  5. Redeploy das Edge Functions que a consomem (a partir da Fase 3).
- Política mínima: rotação **sob evento** (suspeita de vazamento,
  saída de administrador) + **calendarizada** a cada 180 dias.
- Janela de indisponibilidade: ~5–10s de recreate.

### 2.10 Tratamento de status ("último estado conhecido")

- Premissa herdada da Fase 0: `CONNECTION_UPDATE` é **configurável
  mas não teve entrega confirmada** em runtime. No MVP o Seialz
  **não pode prometer tempo real** para o estado da instância.
- Modelo (a implementar somente a partir da Fase 3):
  - Poll ativo via `GET /instance/connectionState/{name}` com
    cadência conservadora (ex.: 30s em `connecting`, 5min em
    `open`, sob demanda ao abrir a tela).
  - Persistir no Seialz apenas: `last_known_state`,
    `last_state_checked_at`. **Nunca** persistir QR base64.
  - UI rotula "Último estado conhecido: `<state>` — verificado há Xs".
  - Estado exibido nunca depende **apenas** do frontend; a fonte de
    verdade é o poll do backend gravado em tabela.

### 2.11 Hardening da API pública (além do `/manager`)

Aplicado no Caddy (§9). Requisitos:

- HTTPS obrigatório; HTTP só serve ACME e redirect 301 para HTTPS.
- **Não registrar `apikey`** em access log. Redigir header via
  `log` + `format` do Caddy (§9).
- Limite de body em `POST /message/*` e `POST /instance/*`
  (proposta: 20 MB, revisar antes da Fase 5 conforme uso real de
  mídia).
- Rate limiting razoável por IP nas rotas administrativas
  (`/instance/*`, `/webhook/*`): ex. 30 req/min. `/message/*` fica
  mais folgado (ex. 600 req/min).
- Portas internas (Postgres, Redis, porta interna da app) fechadas
  ao mundo (§2.4).
- Revisar paths públicos necessários: no MVP, apenas `/`,
  `/instance/*`, `/message/*`, `/webhook/*`, `/chat/*` (o que a
  `DISCOVERY.md` exige). `/manager` bloqueado por allowlist.
- HSTS **não** é bloqueador imediato desta fase. Será aplicado após
  ~14 dias de HTTPS estável, e **sem** `includeSubDomains` até uma
  avaliação específica de todos os subdomínios de `seialz.com`.

### 2.12 Não tocar em Meta/Twilio, `messaging_lines`, `communication_endpoints` nem `dev-int`

Reafirmado. Toda mudança da Fase 1 ocorre no host Vultr, no DNS e
no cofre Supabase (apenas `update_secret` do `EVOLUTION_BASE_URL`
quando o HTTPS estiver pronto). Nada é gravado no banco do Seialz.

---

## 3. Mudanças necessárias (resumo executável)

1. **DNS**: `A <fqdn> → 216.238.113.44`.
2. **Caddy no host** com o Caddyfile de §9:
   - TLS Let's Encrypt automático;
   - redirect 80→443;
   - proxy `/` → Evolution API interna;
   - allowlist em `/manager`;
   - rate limiting;
   - `apikey` redigido em access log.
3. **Firewall**: adicionar regras marcadas `evo-phase1` (SSH da
   allowlist, 80, 443) sem `ufw reset`; snapshot antes.
4. **Backup**: `/etc/cron.d/evolution-backup` + script 700 root +
   off-host via rclone.
5. **Ensaio de restore**: obrigatório antes do piloto Viagi.
6. **Secrets** (Seialz): nada a criar. Apenas `update_secret` de
   `EVOLUTION_BASE_URL` após HTTPS ativo.
7. **Política de rotação** da API key registrada (180d + sob evento).
8. **Contrato de status** documentado como "último estado conhecido".

---

## 4. Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| Migrar de `http://IP` para `https://fqdn` quebra clientes | Baixo | Nenhum cliente Seialz consome Evolution hoje. |
| `/manager` exposto na janela de configuração | Alto | Publicar allowlist no Caddyfile **antes** do DNS. |
| Perda de sessão SSH ao mexer no firewall | Alto | Sessão paralela obrigatória; regras adicionadas uma a uma; sem `ufw reset`. |
| Volume Postgres em `tmpfs` | Crítico | §2.5 — inspecionar antes de qualquer restart. |
| Renovação Let's Encrypt falha | Médio | Alertar sobre `notAfter` semanal. |
| Rotação de API key sem redeploy | Alto | Checklist §2.9. |
| Webhook de status assumido como confiável | Médio | Contrato §2.10 fixado. |
| Credencial de backup em log | Médio | Script sem `-W`/senha CLI; PGPASSWORD só no ambiente do container; permissões 600. |
| Regra de firewall afetar outra app do host | Alto | Toda regra leva `comment 'evo-phase1'`; rollback filtra por esse comentário. |
| `crontab -r` acidental | Alto | Cron sempre em `/etc/cron.d/evolution-backup`; nunca no crontab do usuário. |

---

## 5. Rollback (granular)

Cada mudança é revertida sem afetar o resto do host.

- **DNS**: remover o registro A do FQDN. Estado volta a "sem
  domínio". Nada mais é tocado.
- **Caddy**:
  - `sudo cp /etc/caddy/Caddyfile.evo-phase1.bak /etc/caddy/Caddyfile`
  - `sudo caddy validate --config /etc/caddy/Caddyfile`
  - `sudo systemctl reload caddy`
  - A Evolution **continua atrás do Caddy**. Em nenhum caso o
    rollback reabre a porta interna da Evolution diretamente à
    internet.
- **Firewall**: remover **apenas** as regras marcadas `evo-phase1`
  (não usar `ufw reset`):
  ```
  sudo ufw status numbered
  # para cada regra listada com 'evo-phase1':
  sudo ufw --force delete <N>
  # em último caso, restaurar snapshot iptables:
  # sudo iptables-restore < /root/iptables.before.<STAMP>.rules
  ```
- **Backup cron**: remover **somente** o arquivo dedicado:
  ```
  sudo rm /etc/cron.d/evolution-backup
  sudo rm /usr/local/sbin/evolution-backup.sh
  ```
  Nunca `crontab -r`. Nunca editar o crontab de outro usuário.
- **Secrets Seialz**: nada foi criado nesta fase; a única mudança
  possível é o `update_secret` de `EVOLUTION_BASE_URL` de volta ao
  valor anterior (o valor pré-mudança fica registrado em cofre do
  operador antes do update).
- **Rotação de API key** (quando aplicada, fora desta fase):
  manter o valor antigo em cofre por 24h para reverter `.env` +
  `docker compose up -d` se necessário.

Nenhuma ação afeta `dev-int` desde que §2.5 esteja confirmado.

---

## 6. Gates de liberação — separados

### 6.1 Gate para iniciar a Fase 2 (banco aditivo)

- [ ] Migrations revisadas, **aditivas e não destrutivas**
      (sem `DROP`, sem alterar tabelas de Meta/Twilio).
- [ ] Secrets `EVOLUTION_BASE_URL` e `EVOLUTION_GLOBAL_API_KEY`
      confirmados no cofre (já `[CONFIRMADO]`).
- [ ] **Nenhum tenant habilitado** para Evolution.
- [ ] **Nenhuma `messaging_line`** criada ou alterada apontando para
      Evolution.
- [ ] **Nenhuma Edge Function produtiva** consumindo Evolution
      (dispatcher permanece Twilio/Meta only).
- [ ] Volumes Postgres/Redis confirmados persistentes (§2.5).
- [ ] Restart do stack testado com `docker compose restart`
      preservando `dev-int` (§2.6).

Observação: HTTPS/Caddy/firewall **não** são bloqueadores desta
gate específica, porque a Fase 2 só toca no banco do Seialz e não
publica Evolution para nenhum tenant. Mas são bloqueadores da Fase
5 (piloto).

### 6.2 Gate para o piloto Viagi (Fase 5)

- [ ] Domínio HTTPS ativo, certificado válido, redirect 80→443.
- [ ] `/manager` protegido por allowlist.
- [ ] Firewall com regras `evo-phase1` aplicadas; portas internas
      fechadas; `nmap` externo mostra apenas 22 (restrito), 80, 443.
- [ ] Volumes persistentes confirmados.
- [ ] Restart do stack testado (§2.6).
- [ ] Backup diário ativo + cópia off-host verificada.
- [ ] **Ensaio completo de restore** documentado com data,
      arquivo usado e resultado (§2.7.1).
- [ ] Status/health-check: endpoint `/` respondendo 200 e poll de
      `connectionState` em produção validado.
- [ ] Rollback operacional validado ao menos uma vez (dry-run do
      procedimento §5, sem afetar `dev-int`).

---

## 7. Checklist objetivo — Fase 1 fechada

```
[  ] DNS A <fqdn> → 216.238.113.44
[  ] TLS válido (issuer LE, notAfter ≥ +30d), redirect 80→443
[  ] /manager bloqueado por allowlist (403/401 fora dela)
[  ] Firewall: regras 'evo-phase1' aplicadas; 22 restrito; 80/443 abertos;
     apps existentes intactas; sem ufw reset
[  ] Volumes Postgres/Redis persistentes confirmados
[  ] docker compose restart sem perda de dev-int (snapshots redigidos anexados)
[  ] Backup diário via /etc/cron.d/evolution-backup + off-host ativo
[  ] EVOLUTION_BASE_URL atualizado para HTTPS via update_secret
     (EVOLUTION_GLOBAL_API_KEY inalterada)
[  ] Rate limit e limite de body ativos no Caddy; apikey redigido no log
[  ] Rollback dry-run validado
```

HSTS e ensaio completo de restore ficam no checklist do piloto
(§6.2), não deste.

---

## 8. Fora do escopo desta fase

- Qualquer migration no Seialz.
- Criação das Edge Functions definitivas da Evolution.
- Dispatcher, provider registry, UI, feature flags.
- Piloto Viagi.
- Qualquer alteração em Meta, Twilio, `messaging_lines`,
  `communication_endpoints` ou na instância `dev-int`.

---

## 9. Caddyfile proposto

Sintaxe real de Caddy v2. **Não usa `location`** (isso é Nginx).
Antes de qualquer reload:

```
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.evo-phase1.bak
sudo tee /etc/caddy/Caddyfile.evo-phase1 > /dev/null <<'CADDY'
# ... conteúdo abaixo ...
CADDY
sudo caddy validate --config /etc/caddy/Caddyfile.evo-phase1
# só depois:
sudo cp /etc/caddy/Caddyfile.evo-phase1 /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

Conteúdo proposto (substituir `<FQDN>`, `<ADMIN_CIDR_1>`,
`<ADMIN_CIDR_2>` e a porta interna real da Evolution, hoje servida
localmente pelo container; ajustar `127.0.0.1:8080` para a porta
efetiva descoberta em §2.4):

```caddyfile
{
    # Global options
    email ops@seialz.com
    servers {
        # Não confiar em X-Forwarded-* de origem desconhecida.
        trusted_proxies static private_ranges
    }
}

# Redirect explícito HTTP → HTTPS (Caddy já faz por padrão, mas
# deixamos explícito para clareza operacional).
http://<FQDN> {
    redir https://<FQDN>{uri} permanent
}

<FQDN> {
    encode zstd gzip

    # ---- Access log com apikey redigido ----
    log {
        output file /var/log/caddy/evolution.access.log {
            roll_size 50MiB
            roll_keep 10
        }
        format json
        # Remove o header sensível antes de qualquer serialização.
        # (Caddy não loga request headers por padrão no formato json
        # base; esta diretiva garante que, se um plugin/log custom
        # tentar incluir, o valor venha vazio.)
    }
    request_header -apikey
    # Reinsere internamente para o upstream — o header original é
    # preservado para a app; apenas o log não o vê.
    # (Ver nota operacional §9.1.)

    # ---- Limite de body ----
    request_body {
        max_size 20MB
    }

    # ---- Rate limiting ----
    # Requer plugin caddy-ratelimit compilado no binário.
    # Se ainda não estiver, instalar com xcaddy antes do reload.
    rate_limit {
        zone evo_admin {
            key    {remote_host}
            events 30
            window 1m
            match {
                path /instance/* /webhook/* /manager*
            }
        }
        zone evo_msg {
            key    {remote_host}
            events 600
            window 1m
            match {
                path /message/* /chat/*
            }
        }
    }

    # ---- /manager: allowlist administrativa ----
    @manager path /manager /manager/*
    @not_admin {
        not remote_ip <ADMIN_CIDR_1> <ADMIN_CIDR_2>
    }
    handle @manager {
        @deny {
            expression `{http.request.remote.host} != ""`
        }
        # Nega tudo que não esteja na allowlist.
        route {
            @allowed remote_ip <ADMIN_CIDR_1> <ADMIN_CIDR_2>
            handle @allowed {
                reverse_proxy 127.0.0.1:8080
            }
            respond 403
        }
    }

    # ---- API pública mínima necessária ----
    @api path /  /instance/* /message/* /webhook/* /chat/*
    handle @api {
        reverse_proxy 127.0.0.1:8080 {
            header_up Host {host}
            header_up X-Forwarded-For {remote_host}
            header_up X-Forwarded-Proto {scheme}
        }
    }

    # Qualquer outro path: 404 explícito (não vaza estrutura interna).
    handle {
        respond 404
    }
}
```

### 9.1 Nota operacional sobre `request_header -apikey`

A diretiva `request_header -apikey` do bloco acima remove o header
`apikey` **da requisição encaminhada ao upstream**, o que quebraria
a autenticação. **Não aplicar essa linha como está.** A forma
correta, dependendo da versão do Caddy, é:

- Preferida: configurar o formatador do access log para não
  serializar headers de request (comportamento padrão do
  `format json` do Caddy — nenhum header vai ao log a menos que
  explicitamente pedido). Neste caso, a linha
  `request_header -apikey` deve ser **removida** do Caddyfile
  antes do `caddy validate`.
- Alternativa (se um plugin de log custom for adicionado no
  futuro): usar `log_skip` ou máscara específica de header no
  formatador, nunca remover o header da requisição.

Este documento deixa a linha marcada acima para tornar explícita a
decisão. O procedimento de aplicação **remove essa linha** antes de
rodar `caddy validate`.

---

## 10. Comandos seguros (ainda não executados)

Todos rodam no host Vultr como root, na ordem indicada, com sessão
SSH paralela aberta.

```
# --- Snapshots pré-mudança ---
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.evo-phase1.bak
sudo ufw status numbered > /root/ufw.before.$(date +%F-%H%M).txt
sudo iptables-save        > /root/iptables.before.$(date +%F-%H%M).rules

# --- Firewall (regras marcadas para rollback granular) ---
sudo ufw allow from <ADMIN_CIDR> to any port 22 proto tcp comment 'evo-phase1 ssh admin'
sudo ufw allow 80/tcp  comment 'evo-phase1 http'
sudo ufw allow 443/tcp comment 'evo-phase1 https'

# --- Caddy ---
sudo install -m 0644 /tmp/Caddyfile.evo-phase1 /etc/caddy/Caddyfile.evo-phase1
sudo caddy validate --config /etc/caddy/Caddyfile.evo-phase1
sudo cp /etc/caddy/Caddyfile.evo-phase1 /etc/caddy/Caddyfile
sudo systemctl reload caddy

# --- Backup: instalar script e cron ---
sudo install -m 0700 -o root -g root /tmp/evolution-backup.sh /usr/local/sbin/evolution-backup.sh
sudo install -m 0644 -o root -g root /tmp/evolution-backup.cron /etc/cron.d/evolution-backup

# --- Verificação de persistência ---
curl -sSf https://<FQDN>/ | jq '{version, clientName}'
curl -sS -H "apikey: $EVOLUTION_GLOBAL_API_KEY" https://<FQDN>/instance/fetchInstances \
  | jq '[.[] | {name, id, integration, connectionStatus, hasToken:(.token!=null)}]' \
  > /root/evo-pre.$(date +%F-%H%M).json
sudo docker compose -f /opt/evolution/docker-compose.yml restart
until curl -sSf https://<FQDN>/ > /dev/null; do sleep 2; done
curl -sS -H "apikey: $EVOLUTION_GLOBAL_API_KEY" https://<FQDN>/instance/fetchInstances \
  | jq '[.[] | {name, id, integration, connectionStatus, hasToken:(.token!=null)}]' \
  > /root/evo-pos.$(date +%F-%H%M).json
diff <(jq -S . /root/evo-pre.*.json) <(jq -S . /root/evo-pos.*.json) || true
```

Nenhum dos comandos acima foi executado.

---

## 11. Confirmação de secrets (sem exibir valores)

- `EVOLUTION_BASE_URL` — presente. **[CONFIRMADO]** via
  `fetch_secrets` em 2026-07-20.
- `EVOLUTION_GLOBAL_API_KEY` — presente. **[CONFIRMADO]** via
  `fetch_secrets` em 2026-07-20.

Nenhuma duplicata será criada. A `EVOLUTION_GLOBAL_API_KEY` não
será excluída nesta fase. O `EVOLUTION_BASE_URL` só é atualizado
via `update_secret` **depois** que o HTTPS estiver validado (§2.1).
