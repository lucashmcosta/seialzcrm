## Objetivo

Criar `docs/MOBILE_DASHBOARD.md` — dump técnico único e literal para replicar a tela "Início" no app React Native/Expo. Sem resumir código: colar o conteúdo direto dos arquivos web e o SQL das tabelas envolvidas.

## Estrutura do documento

### 1. Visão geral rápida
- A tela **NÃO usa RPC**. Todos os KPIs, gráfico e donut são calculados **client-side** a partir de duas queries diretas em `public.opportunities`.
- Filtros persistidos em `localStorage` via `usePersistedFilters` (no mobile, trocar por `AsyncStorage`).
- Tema por organização vem de 4 colunas em `public.organizations` (`theme_primary_color`, `theme_sidebar_color`, `theme_dark_mode`, `theme_preset`) + `logo_url`.

### 2. Código-fonte (colado literal)

Colar na íntegra, sem reescrever:
- `src/pages/Dashboard.tsx` (430 linhas — a página completa, inclusive versão desktop e o branch mobile que renderiza `MobileDashboard`)
- `src/components/mobile/MobileDashboard.tsx` (versão mobile atual do web — referência direta para porting Expo)
- `src/components/reports/ReportFilters.tsx` (filtros de período + owner)
- `src/lib/report-period.ts` (`computeRange`, `PeriodPreset`, `CustomRange`)
- `src/components/reports/DashboardTrendChart.tsx` (gráfico linha Entradas x Fechamentos, agregação diária/semanal)
- `src/components/reports/DashboardStatusDonut.tsx` (donut Abertas/Ganhas/Perdidas)
- `src/lib/fetchAllPagedRows.ts` + `dedupeRowsById` (paginação usada pelas queries)
- `src/hooks/usePersistedFilters.ts` (com nota: no Expo trocar `localStorage` por `AsyncStorage`)
- `src/hooks/usePermissions.ts` (controle de `viewAllOpportunities`)
- `src/contexts/OrganizationContext.tsx` (trecho do select que traz `theme_*` e `logo_url`) — referenciar `docs/MOBILE_APP_BACKEND.md` para o resto
- `src/contexts/ThemeContext.tsx` (como as CSS vars são aplicadas — no Expo virar objeto de estilos ou styled tokens)

### 3. Fonte dos dados dos cards e gráficos

Documentação explícita das duas queries em `Dashboard.tsx > fetchStats()`:

**Query A — "entradas" (opportunities criadas no período)**
```ts
supabase
  .from('opportunities')
  .select('id, title, status, created_at, updated_at, close_date, amount, contact_id, owner_user_id, contacts:contact_id(full_name), users:owner_user_id(full_name)')
  .eq('organization_id', organization.id)
  .is('deleted_at', null)
  // se !canViewAll: .eq('owner_user_id', userProfile.id)
  // senão se ownerId != 'all': .eq('owner_user_id', ownerId)
  .gte('created_at', from.toISOString())
  .lte('created_at', to.toISOString())
```

**Query B — "fechamentos" (status=won com close_date no período)**
```ts
  .eq('status', 'won')
  .gte('close_date', toDayStr(from))   // YYYY-MM-DD local
  .lte('close_date', toDayStr(to))
```

As duas rodam em paralelo, resultado é deduplicado por `id`.

**Fórmulas exatas dos KPIs (`Dashboard.tsx` linhas 236–262):**
- `entered` = count de linhas com `created_at ∈ [from, to]`
- `closed` = count de linhas com `status === 'won'` **E** `close_date ∈ [from, to]` (parsing local, não UTC)
- `conversion` = `entered > 0 ? (closed / entered) * 100 : null` (é `fechadas / entradas` — inclui fechamentos do período mesmo que a oportunidade tenha entrado fora dele)

**Gráfico "Entradas x Fechamentos" (`DashboardTrendChart.tsx`):**
- Bucket diário se período ≤ 90 dias, semanal (segunda a domingo) se > 90 dias
- `Entradas` agrega por `created_at`
- `Fechamentos` agrega por `close_date` (só `status === 'won'`)
- `close_date` é `DATE` — parseado como midnight LOCAL para evitar shift de fuso (função `parseLocalDate`)

**Donut de status (`DashboardStatusDonut.tsx`):**
- Considera apenas oportunidades com `created_at ∈ [from, to]`
- Buckets: `open`, `won`, `lost`. Qualquer outro status colapsa em `open`.

**Valores de `opportunities.status`:**
- `'open'` → Abertas
- `'won'` → Ganhas
- `'lost'` → Perdidas
(Confirmar via `SELECT DISTINCT status FROM opportunities` no Supabase se necessário — o web trata só esses três.)

### 4. Filtros

**Presets de período (`report-period.ts`):**
Colar o `computeRange` inteiro. Lista:
- `today`, `yesterday`
- `this_week`, `last_week` (semana começa segunda)
- `this_month`, `last_month`
- `last_7`, `last_30`, `last_90`, `last_365` (janelas móveis inclusivas)
- `custom` (usuário escolhe `from`/`to`)

Cada preset produz `{ from: Date, to: Date }` com `from` em `00:00:00.000` local e `to` em `23:59:59.999` local. Convertidos para ISO na query de `created_at` e para `YYYY-MM-DD` local na query de `close_date`.

**Seletor de vendedor:**
- Só renderiza se `permissions.viewAllOpportunities === true`
- Query que popula (`Dashboard.tsx` linhas 97–111):
  ```ts
  supabase
    .from('user_organizations')
    .select('user_id, users(id, full_name)')
    .eq('organization_id', organization.id)
    .eq('is_active', true)
  ```
- `ownerId = 'all'` → sem filtro; `ownerId = <uuid>` → `.eq('owner_user_id', ownerId)`
- Usuário sem `viewAllOpportunities` é forçado a `owner_user_id = userProfile.id` (sempre vê só o próprio).

### 5. Tema por organização

Colunas em `public.organizations` (source of truth):
- `theme_primary_color` — string HSL "H S% L%" (ex.: `"142 71% 45%"` verde, `"206 50% 29%"` azul). **NÃO é hex.**
- `theme_sidebar_color` — mesmo formato HSL
- `theme_dark_mode` — boolean
- `theme_preset` — `'default' | 'seialz'` (quando `seialz`, o preset assume as cores próprias e ignora `theme_primary_color`)
- `logo_url` — URL absoluta (Supabase Storage ou externa)
- `logo_size` — inteiro opcional (tamanho renderizado)

Como o web aplica (colar `ThemeContext.tsx` inteiro). Defaults:
- `DEFAULT_PRIMARY = '206 50% 29%'`
- `DEFAULT_SIDEBAR = '0 0% 98%'`
- `primary-foreground` calculado por luminosidade: `L > 65 → '217 33% 17%'` (dark text), senão `'0 0% 100%'` (white text).

**Porting para Expo:**
- Parse do HSL: `const [h, s, l] = str.split(' ').map(v => parseFloat(v))` → passar para `hsl(h, s%, l%)` em `StyleSheet` ou styled-components.
- Sem CSS vars — expor via `ThemeContext` do RN e consumir com `useTheme()`.

### 6. Schema SQL das colunas relevantes

Rodar via `supabase--read_query` e colar o resultado:
```sql
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('opportunities', 'organizations', 'user_organizations', 'users', 'contacts')
  AND column_name IN (
    'id','title','status','created_at','updated_at','close_date','amount',
    'contact_id','owner_user_id','organization_id','deleted_at',
    'theme_primary_color','theme_sidebar_color','theme_dark_mode','theme_preset',
    'logo_url','logo_size','full_name','is_active','user_id'
  )
ORDER BY table_name, column_name;
```

Mais: `SELECT DISTINCT status FROM public.opportunities WHERE organization_id IS NOT NULL LIMIT 20;` para confirmar valores reais.

### 7. Notas de porting Expo (curto)

- `localStorage` → `@react-native-async-storage/async-storage`
- `recharts` → `victory-native` ou `react-native-svg-charts`
- CSS vars → objeto `theme` no context
- `useNavigate` → `useNavigation` (React Navigation)
- Sem `<Dialog>` — usar `Modal` do RN ou `@gorhom/bottom-sheet`
- Datas: manter parsing local exato de `close_date` (evitar `new Date('YYYY-MM-DD')` que shifta para UTC)

## Entregável
- Um arquivo: `docs/MOBILE_DASHBOARD.md`
- Sem alterar código do projeto web.
