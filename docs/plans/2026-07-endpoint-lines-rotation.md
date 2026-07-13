# Linhas de mensageria + rotação de número (WhatsApp)

**Status:** desenho aprovado conceitualmente — pendente aprovação de implementação por fase.
**Contexto:** números WhatsApp caem (bans Meta). O modelo atual amarra a conversa ao número físico, então trocar de número quebra envio, histórico e UI. Este doc separa **conversa** (do contato) de **número de envio** (rotacionável), com rotação como recurso de primeira classe.

## Problema (causa-raiz)
`message_threads.primary_endpoint_id` faz **dois papéis ao mesmo tempo**: (1) dono do histórico e (2) número de envio. Quando o número cai, os papéis conflitam → replies vão pro número morto e falham (Meta 100/133010); a UI mostra 7020 no header, templates do 7067 no seletor e envia pelo 7020. Ver auditoria P0 de 2026-07-13.

## Modelo — 3 conceitos separados
| Conceito | O que é | Rotaciona? |
|---|---|---|
| **Conversa** (`message_threads`) | Identidade lógica com o **contato**. Uma por contato/canal. | ❌ nunca |
| **Mensagem** (`messages.endpoint_id`) | Número físico por onde a msg passou. Histórico imutável. | ❌ nunca (antigas ficam) |
| **Linha** (`messaging_lines`) | Papel (Comercial/Atendimento) → aponta pro **número ativo agora**. | ✅ **só isso** |

Grão atual: **1 linha por tela**, **1 número ativo por linha**.
- `/messages` → linha **Comercial** → hoje deve ser **7067** (bf04ce63)
- `/inbox` → linha **Atendimento** → **7027** (c09bd713)

Futuro (sem refazer): várias linhas por tela (diluir risco de ban) = remover o unique de `(org, key)`.

## Esquema (novo)
```sql
-- Uma linha por papel por org (unique garante "1 número ativo por tela" hoje)
create table messaging_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  key text not null check (key in ('commercial','customer_service')),
  name text not null,
  active_endpoint_id uuid references communication_endpoints(id), -- número ativo AGORA (null = sem número → bloqueia envio)
  channel text not null default 'whatsapp',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, key, channel) -- FUTURO: dropar p/ múltiplas linhas por tela
);

-- Log de rotação (auditoria: de/para/quando/quem/motivo)
create table messaging_line_rotations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id),
  line_id uuid not null references messaging_lines(id),
  from_endpoint_id uuid references communication_endpoints(id),
  to_endpoint_id uuid references communication_endpoints(id),
  reason text,
  rotated_by_user_id uuid references users(id),
  rotated_at timestamptz not null default now()
);
```
- `message_threads.primary_endpoint_id` **passa a significar "endpoint de ORIGEM"** (histórico/primeiro número). Não muda mais o valor das threads existentes.
- `messages.endpoint_id` inalterado — fonte da verdade do histórico e do marcador de rotação.
- Thread → linha via `business_context` (`sales`→commercial, `support`→customer_service). Sem migração de thread.

## Resolução de envio (nova regra)
Substitui o "primary_endpoint_id sempre ganha" por:
1. thread → linha (por `business_context` + org).
2. `endpoint = line.active_endpoint_id`.
3. Se `endpoint` existe **e** está `is_active=true/online` → envia por ele; grava `messages.endpoint_id = endpoint`.
4. Se `active_endpoint_id` é null **ou** o endpoint está inativo → **bloqueia** com ação clara: *"A linha Comercial está sem número ativo. Designe um número."* (nunca tenta número morto, nunca falha mudo).
- **Anti cross-number preservado:** thread de vendas só resolve pra linha Comercial; nunca envia pelo número de atendimento.
- **Janela 24h:** o número ativo tem janela própria por contato. Primeiro toque num número recém-rotacionado está fora de janela → sistema oferece **template** (não texto livre).

## /messages — histórico contínuo
- Timeline **única por contato**: todas as mensagens (7020 + 7067) juntas, em ordem.
- **Marcador de rotação**: onde `endpoint_id` muda entre mensagens consecutivas → divisor *"📞 Número alterado: 7020 → 7067 · 13/07"*.
- **Header**: número **ativo da linha** (7067) + chip *"histórico inclui 7020 (desconectado)"*.
- **Composer + seletor de templates**: escopados no número **ativo** (WABA do 7067). Fim do descasamento de 3 vias.

## Painel de rotação
- Designar/trocar o `active_endpoint_id` da linha, com motivo → grava `messaging_line_rotations`.
- Corrigir **"Desconectar"** para ser **por-número** (hoje `meta-whatsapp-disconnect` derruba TODOS os endpoints meta da org de uma vez — bug perigoso).

## Migração do estado atual (sem fragmentar, sem reescrever histórico)
1. Criar `messaging_lines`: Comercial→7067, Atendimento→7027.
2. As **1.438 threads** do 7020 ficam como estão (`primary_endpoint_id=7020` = origem histórica). O envio passa a resolver pela **linha** (7067) → replies voltam a funcionar (via template, janela fechada).
3. Nenhuma mensagem antiga é alterada. Nenhuma thread nova/duplicada.

## Fases
- **Fase 0 (URGENTE) — estancar + fazer o comercial enviar de novo:**
  - Criar `messaging_lines` (Comercial→7067, Atendimento→7027).
  - Resolução de envio por linha na edge `meta-whatsapp-send` + `dispatchWhatsAppSend`: quando o primary está inativo, usar o número ativo da linha em vez de falhar/travar. Bloqueio limpo se a linha não tem número.
  - **Resultado:** operadores voltam a responder as threads comerciais (pelo 7067) hoje.
- **Fase 1 — /messages contínua:** timeline unificada + marcador de rotação + header (número ativo + chip histórico) + templates escopados no ativo.
- **Fase 2 — painel de rotação:** designar/trocar número da linha com log + "Desconectar" por-número.
- **Fase 3 (futuro):** múltiplas linhas por tela (diluição de risco de ban).

## Verificação
- Envio comercial numa thread antiga (7020) usa 7067 e entrega (via template).
- Nenhum envio pelo número morto; nenhum cross-number.
- Histórico contínuo por contato com marcador; nenhuma mensagem antiga alterada.
- Rotação: trocar `active_endpoint_id` → todas as threads comerciais seguem, com log.
