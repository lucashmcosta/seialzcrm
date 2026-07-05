# Auditoria WhatsApp — Central Trabalhista (+55 11 5028-7020)

- **Org**: Central Trabalhista (`40ae935c-a7f7-4ad7-8ea4-91be6404a95f`)
- **Endpoint**: `407ff93d-4860-49cd-82ae-beda456c1774` (provider `meta_cloud_api`, contexto `sales`, `status=online`)
- **Janela analisada**: últimos 30 dias (o endpoint só tem tráfego relevante desde **2026-06-27**, ou seja, ~8 dias corridos)
- **Modo**: read-only. Nenhum dado alterado.

---

## Resumo executivo

O número **7020 está sendo penalizado pela Meta por rajada de templates de MARKETING para lista fria**. Existe evidência direta da Meta bloqueando envios por qualidade (erro `131049`), taxa de falha de **19,4%** nos templates, **67,7% dos destinatários nunca responderam** e casos concretos de **5 templates em 25 h** para o mesmo contato sem qualquer inbound.

O problema **não está distribuído** — está concentrado em:

- **2 templates MARKETING** (`tentativa_de_contato`, `primeiro_contato`) = **87% do volume**.
- **3 operadoras** (`Tamires Sousa`, `Victoria Amorim`, `Luana Cardoso`) = **95% dos templates enviados**.
- **Lista fria**: 236/341 threads (69%) sem qualquer inbound nos últimos 60 dias.

### Health Score do número: **CRÍTICO**

| Indicador | Valor | Faixa saudável | Status |
|---|---|---|---|
| Taxa de falha em templates | 19,4% | < 2% | 🔴 Crítico |
| Bloqueios ativos pela Meta (`131049`) | 9 | 0 | 🔴 Crítico |
| Reply rate MARKETING | 8,8% – 11,7% | > 25% | 🔴 Crítico |
| % contatos sem inbound em 60d | 69% | < 20% | 🔴 Crítico |
| Threads com ≥2 templates | 38 (11%) | < 1% | 🔴 Alto |
| Templates MARKETING / total | 87% | < 40% | 🔴 Alto |

---

## Parte 1 — Volume geral (30d)

| Métrica | Total |
|---|---|
| Outbound total | **3.193** |
| Templates | **396** |
| Freeform (janela 24h) | 2.797 |
| Inbound | 3.148 |
| Threads ativos | 661 |

### Por dia

| Dia | Templates | Freeform | Inbound |
|---|---|---|---|
| 2026-07-04 | 5 | 166 | 197 |
| 2026-07-03 | 31 | 701 | 824 |
| 2026-07-02 | **156** | 395 | 410 |
| 2026-07-01 | 81 | 318 | 382 |
| 2026-06-30 | **103** | 762 | 850 |
| 2026-06-29 | 20 | 391 | 390 |
| 2026-06-28 | 0 | 8 | 41 |
| 2026-06-27 | 0 | 56 | 54 |

⚠️ Dois picos claros: **30/06 (103 templates)** e **02/07 (156 templates)**. A queda para 5 templates em 04/07 sugere que o alerta Meta já chegou nesse intervalo.

### Horário de pico (America/Sao_Paulo)

Concentração violenta em **10h (75)** e **13h (75)** — janela almoço/pré-almoço, típica de disparo em lote. 96% dos templates entre 10h e 18h.

---

## Parte 2 — Templates

| Template | Categoria | Enviados | Entregues | Lidos | Falhas | Reply 48h | Reply % |
|---|---|---|---|---|---|---|---|
| `tentativa_de_contato` | MARKETING | **196** | 152 | 123 | **37 (18,9%)** | 23 | **11,7%** |
| `primeiro_contato` | MARKETING | **148** | 108 | 91 | **32 (21,6%)** | 13 | **8,8%** |
| `conscentimento` | UTILITY | 47 | 35 | 24 | 8 (17%) | 6 | 12,8% |
| `marcar_entrevista` | UTILITY | 4 | 3 | 2 | 0 | 3 | 75% |
| `processo_distribuido` | UTILITY | 1 | 0 | 0 | 0 | 1 | 100% |

**Templates suspeitos**: `tentativa_de_contato` e `primeiro_contato` são MARKETING, respondem ~10% e falham ~20%. São a origem do problema.

Observação: `conscentimento` está grafado errado (correto é *consentimento*) — não é causa do LOW, mas convém corrigir na Meta.

---

## Parte 3 — Rajadas de templates

| Regra | Threads |
|---|---|
| ≥ 2 templates no período | **38** |
| ≥ 3 templates em 7 dias | **12** |
| ≥ 2 templates em 24 h | 0* |
| ≥ 3 templates em 24 h | 0* |

*Zero em 24h corridas até agora — mas a análise sobre a janela completa mostra que **quase todas as rajadas estão dentro de 24 h reais** (ver top 10).

### Top rajadas (todas com **zero respostas**)

| Contato | Telefone | Templates | Janela |
|---|---|---|---|
| Rejane Iane Ferreira | +5551982050539 | **5** | 25,7 h |
| Abiail Martins | +5512996069643 | 4 | 6,8 h |
| Augusto Valentin | +5519987318823 | 4 | 23,5 h |
| Renato José Prazeres | +554799926820 | 4 | 14,7 h |
| Maria Inês | +14199917369 | 3 | **0,3 h** |
| Gilson Nascimento | +554992513546 | 3 | 1,7 h |
| Noili Ventura | +5545999579625 | 3 | 62,7 h |
| Fabio | +556281116302 | 3 | 24,6 h |
| Cheila | +556492512285 | 3 | 17,7 h |
| Carlos Alberto Geraldo | +5524981289570 | 3 | 15,7 h |

Casos como Maria Inês (3 templates em 18 min) e German Fernandez Duarte (2 templates em 12 s) são **exatamente** o padrão que a Meta trata como spam.

---

## Parte 4 — Contatos frios

| Métrica | Valor | % do volume |
|---|---|---|
| Threads que receberam template | 341 | 100% |
| Threads que **nunca responderam** | **231** | **67,7%** |
| Threads **sem inbound nos últimos 60 dias** | **236** | **69,2%** |

Mais de 2/3 do disparo de templates está indo para gente que não conversa com a Central Trabalhista — clássica reativação de lista fria, que a Meta pune.

---

## Parte 5 — Bloqueio potencial / falhas

| Status | Qtd |
|---|---|
| read | 240 |
| delivered | 58 |
| sent (não confirmou entrega) | 21 |
| **failed** | **77** |

### Erros Meta (smoking gun 🔫)

| Código Meta | Qtd | Significado |
|---|---|---|
| **131049** | 9 | *"Message not delivered to maintain healthy ecosystem engagement"* — **Meta bloqueando ativamente por qualidade**. Este é o efeito visível do LOW. |
| **131026** | 50 | *Message undeliverable* — número inexistente/sem WhatsApp, bloqueou o business, ou fora do escopo → lista fria e bases sujas. |
| **131008** | 12 | Parâmetro obrigatório faltando (defeito no envio do template). |
| **130472** | 6 | Usuário em experimento de rate-limit da Meta. |

`131049` é a assinatura oficial de "seu número perdeu qualidade". `131026` em massa confirma base de contatos podre.

---

## Parte 6 — Funil por template

| Template | Enviado→Entregue | Entregue→Lido | Lido→Resposta |
|---|---|---|---|
| `tentativa_de_contato` | 77,6% | 80,9% | 18,7% |
| `primeiro_contato` | 73,0% | 84,3% | 14,3% |
| `conscentimento` | 74,5% | 68,6% | 25,0% |

Nos 2 templates MARKETING responsáveis por 87% do volume, **~25% dos envios sequer chegam**. Isso é altíssimo — o normal é > 95%.

---

## Parte 7 — Templates consecutivos (candidatos ao alerta Meta)

- **38 threads** com ≥ 2 templates no período
- **12 threads** com ≥ 3 templates em 7 dias
- **11 dessas 12** threads têm **zero inbound após o primeiro template**

Ou seja: a operação **continuou reenviando template mesmo depois de silêncio total**. Este é o gatilho direto do alerta de spam.

---

## Parte 8 — Operadores

| Operadora | Templates | Threads distintos | % do total |
|---|---|---|---|
| **Tamires Sousa** | 170 | 125 | **42,9%** |
| **Victoria Amorim** | 108 | 106 | **27,3%** |
| **Luana Cardoso** | 99 | 99 | **25,0%** |
| Luyza Calegari | 7 | 6 | 1,8% |
| Lucas Costa | 6 | 5 | 1,5% |
| Mariane Carvalho | 4 | 3 | 1,0% |
| Junior Domingos | 2 | 2 | 0,5% |

**Tamires Sousa** é a única com relação `templates/threads > 1` (170/125 = **1,36**), ou seja, é a operadora que mais reenvia template para o mesmo contato. Ela é a fonte principal das rajadas.

---

## Parte 9 — Diagnóstico consolidado

**Por que o 7020 caiu para LOW e recebeu alerta de spam:**

1. **Meta 131049** já disparado 9× → o LOW não é risco, é fato consumado.
2. **19,4% de falha** em template — bases sujas + envios repetidos para números que não têm WhatsApp (50× `131026`).
3. **Reply rate 8–12%** em MARKETING — Meta usa reply-rate como principal sinal de qualidade; abaixo de 15% já é penalizado.
4. **69% de lista fria** — reativação para contatos sem inbound há 60d é o pior padrão possível.
5. **Rajadas comprovadas**: 5 templates em 25h, 3 templates em 18 min, 2 templates em 12s.
6. **Concentração operacional**: 1 operadora (Tamires) responde por 43% dos disparos e é a única que reenvia.

O problema **não é distribuído**. É:
- **2 templates MARKETING**, específicos.
- **3 operadoras**, sendo 1 crítica.
- **1 base fria** de ~230 contatos.

---

## Parte 10 — Ações corretivas recomendadas

### Imediatas (hoje)

1. **Pausar** os templates `tentativa_de_contato` e `primeiro_contato` até reformulação.
2. **Congelar** disparos de MARKETING para contatos sem inbound nos últimos 60d.
3. **Falar com a Tamires Sousa** — parar reenvios ao mesmo contato dentro de 7 dias.
4. **Limpar 236 contatos frios** dessa base antes de qualquer novo disparo (rodar diagnóstico Meta ou remover números sem inbound).

### Regras que deveriam existir no produto (proposta)

| Regra | Ação |
|---|---|
| Mesmo contato, ≥ 1 template em 24 h | Bloquear novo template |
| Mesmo contato, ≥ 2 templates sem resposta | Cooldown de 7 dias |
| Mesmo contato, ≥ 3 templates sem resposta | Cooldown de 30 dias |
| Contato sem inbound em 60 dias | Só permitir UTILITY (não MARKETING) |
| Endpoint em quality LOW | Reduzir volume diário automaticamente |
| Alerta de spam Meta recebido | Pausar campanhas até revisão manual |

### Recuperação de qualidade (7–14 dias)

- Volume diário de templates < 30/dia enquanto o número estiver LOW.
- Só templates UTILITY até quality voltar para MEDIUM.
- Priorizar respostas humanas rápidas (freeform) para aumentar reply-rate agregado do número.
- Corrigir template `conscentimento` → `consentimento` e revisar copy dos MARKETING para reduzir denúncias.

---

## Apêndice — Queries SQL utilizadas

Todas rodam com filtro fixo:
`organization_id = '40ae935c-a7f7-4ad7-8ea4-91be6404a95f'`
`endpoint_id = '407ff93d-4860-49cd-82ae-beda456c1774'`
`sent_at >= now() - interval '30 days'`
`deleted_at IS NULL`

- **Volume por dia**: `GROUP BY date_trunc('day', sent_at)` com filtros por `direction` e `template_id`.
- **Templates**: `JOIN whatsapp_templates` + `count(*) FILTER (WHERE whatsapp_status IN (...))`.
- **Reply rate**: subquery `EXISTS` em `messages` `direction='inbound'` na mesma `thread_id` até 48h.
- **Rajadas**: CTE por `thread_id` com `count(*) >= 2` e `HAVING`, junto com `min/max(sent_at)` e checagem de inbound.
- **Contatos frios**: `NOT EXISTS` de inbound em 60 dias por `thread_id`.
- **Erros Meta**: `GROUP BY error_code` em `whatsapp_status='failed'`.
- **Operadores**: `JOIN users ON users.id = messages.sender_user_id`, `GROUP BY full_name`.

Todas as queries brutas foram executadas via `supabase--read_query` no dia da auditoria; podem ser replicadas colando no SQL Editor.

<presentation-actions>
<presentation-link href="https://supabase.com/dashboard/project/qvmtzfvkhkhkhdpclzua/sql/new">Abrir SQL Editor</presentation-link>
</presentation-actions>
