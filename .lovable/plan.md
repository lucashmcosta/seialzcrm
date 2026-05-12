## Objetivo
Sincronizar `opportunities.status` com o `pipeline_stages.type` para a organização inteira, eliminando a inconsistência que hoje esconde 697 oportunidades do Kanban (278 da Victoria) e infla os números de "abertas" nos relatórios.

## O que vai acontecer

### 1. Migração de dados (one-shot UPDATE)
Para a org `40ae935c-a7f7-4ad7-8ea4-91be6404a95f`:

- Toda opp em estágio com `type = 'lost'` → `status = 'lost'`
- Toda opp em estágio com `type = 'won'` → `status = 'won'`
- Toda opp em estágio com `type = 'open'` (custom) → `status = 'open'`
- Preencher `close_date = COALESCE(close_date, updated_at, now())` para as que viraram won/lost e ainda não tinham data de fechamento (necessário para relatórios de tempo de ciclo).
- Não mexer em `deleted_at`, owner, valor, estágio nem em qualquer outro campo.

Impacto esperado:
- ~697 opps da org passam de `open` → `lost`/`won` (a maioria lost).
- Victoria: cai de 336 "abertas" para ~58 abertas reais (34 em "Em negociação" + 24 que estavam em estágio "Ganho" mas agora viram won, então **34 abertas + 24 won + 278 lost** = 336 totais, batendo com o SELECT dela).
- Kanban e Relatórios passam a mostrar os MESMOS números.

### 2. Trigger de proteção (evita o problema voltar)
Criar trigger `BEFORE INSERT OR UPDATE` em `opportunities` que:
- Quando `pipeline_stage_id` muda, força `status` a refletir o `type` do novo estágio.
- Quando `status` é alterado manualmente para `won`/`lost`, mantém (não sobrescreve estágio — é só guard-rail no sentido stage→status, que é o fluxo que quebrou).

Isso garante que mover um card no Kanban para "Perdido" sempre marca a opp como `lost`, mesmo se o código frontend esquecer de atualizar o status (que é a causa raiz suspeita do drift histórico, provavelmente vindo do import do Kommo + drags antigos).

### 3. Verificação pós-migração
Rodar 3 SELECTs de sanidade e te mostrar o resultado:
- Contagem por `status` da Victoria (esperado: bate com os 336 totais dela).
- Contagem por `(stage.type, status)` da org (esperado: zero linhas em diagonal divergente).
- Total de cards visíveis no Kanban por estágio (esperado: bate com o relatório).

## Por que não mexer só na UI
Criar uma "coluna fantasma" no Kanban mascararia o problema e os relatórios continuariam mentindo. Como você confirmou a regra de negócio ("perdido = lost, ganho = won"), o caminho correto é arrumar o dado e travar com trigger.

## Escopo
- **Só** a org da Seialz (`40ae935c-...`). Não toca em outras orgs.
- **Sem** mudanças no frontend nesta etapa — Kanban e Relatórios já leem `status` corretamente, só estão recebendo dado sujo.
- Reversível: antes do UPDATE, dump dos `(id, status, close_date)` atuais numa tabela `opportunities_status_backup_20260512` para rollback se algo der errado.

## Detalhes técnicos
- 1 migração SQL com: backup table + UPDATE em batch + função+trigger de sync.
- Trigger usa `SECURITY DEFINER` com `search_path = public`, segue o padrão das outras funções da org.
- Sem alteração de RLS, sem alteração de schema das tabelas existentes (só adiciona a tabela de backup).
