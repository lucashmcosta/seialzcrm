# Drill-down nos KPIs de Atendimento

Tornar os cards **"Tempo médio 1ª resposta"** e **"Tempo médio de resposta"** clicáveis. Ao clicar, abre um modal leve com:

- **Top 20 piores casos** do período (ordenados por gap desc)
- **Distribuição rápida**: mediana, p90, máximo (pra contextualizar a média)
- Linha por linha: contato, responsável, quando entrou, quando respondeu, gap formatado
- Clicar na linha → navega para `/messages?thread=<id>` (ou abre a conversa)

## Por que assim (peso na tela)

- **Sob demanda**: dados só são buscados quando o usuário clica no card. Nada extra no load do dashboard.
- **Reaproveita** o que `useServiceStats` já busca (`message_response_times` filtrado por org + período + cutoff 30/05). Não duplica query — extraímos a lista pra um novo hook que o modal consome.
- **Limite hard de 20 linhas** + join leve (contact name, user name) via 2 chamadas `.in()` em vez de embed.
- Modal usa o `Dialog` do shadcn já presente no projeto, sem novas libs.

## Arquivos

1. **`src/hooks/useServiceWorstResponses.ts`** (novo)
   - Params: `organizationId`, `from`, `to`, `ownerId`, `kind: 'first' | 'all'`, `enabled`
   - Só dispara quando `enabled=true` (modal aberto)
   - Aplica o mesmo `SERVICE_MODULE_START_ISO` cutoff
   - Para `kind='first'`: agrupa por `thread_id` e pega o menor `inbound_at` ≥ cutoff de cada thread, depois ordena por `response_seconds` desc, top 20
   - Para `kind='all'`: ordena diretamente `message_response_times` por `response_seconds` desc, top 20
   - Calcula mediana / p90 / max sobre os valores já carregados pelo `useServiceStats` (passados como prop) — sem nova query
   - Enriquecimento: 1 query `users.in(id, ...)` + 1 query `contacts.in(id, ...)` + 1 query `message_threads.in(id, ...)` pra pegar `contact_id`

2. **`src/components/reports/ServiceResponseDetailDialog.tsx`** (novo)
   - Props: `open`, `onClose`, `kind`, `title`, `stats` (mediana/p90/max), `rows`, `loading`
   - Header com 3 mini-stats (mediana / p90 / máximo)
   - Tabela densa com: Contato · Responsável · Inbound · Outbound · Gap
   - Click na linha → `navigate('/messages?thread=<id>')`

3. **Página do dashboard de Atendimento** (achar via grep — provavelmente `src/pages/dashboards/...` ou `ServiceDashboard.tsx`)
   - Adicionar `onClick` nos dois cards
   - Estado `detail: null | 'first' | 'all'`
   - Renderizar `<ServiceResponseDetailDialog />`
   - Adicionar visual de "clicável" (cursor-pointer, hover sutil) — mesmo padrão do `Dashboard.tsx`

## Fora de escopo (avisar e perguntar depois)

- Não vou trocar média por mediana no card principal (só mostrar dentro do modal)
- Não vou aplicar filtro de horário comercial agora
- Não vou exportar CSV

## Validação

- Abrir card "Tempo médio 1ª resposta" → ver top 20 com TAMIRIS / W F B S / Elisangela no topo
- Verificar que mediana << média (confirma que outliers puxam o número)
- Clicar numa linha → abre a conversa correspondente
