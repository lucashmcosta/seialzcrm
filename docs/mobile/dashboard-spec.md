# Mobile Dashboard — Tela "Início"

Dump técnico literal para replicar a tela **Início** (dashboard inicial) no app React Native / Expo. Complementa `docs/mobile/backend-reference.md` (credenciais Supabase, auth, RLS).

---

## 1. Visão geral

- **NÃO usa RPC.** Todos os KPIs, gráfico de linha e donut são calculados **client-side** a partir de 2 queries diretas em `public.opportunities`.
- Filtros de período + vendedor persistidos por (usuário × organização × escopo) — web usa `localStorage`; no Expo, trocar por `AsyncStorage`.
- Tema por organização vem de 4 colunas em `public.organizations` (+ `logo_url`). Cor primária é **string HSL** ("H S% L%"), **não hex**.
- Enum `opportunity_status` no Postgres: `open | won | lost`.

---

## 2. Schema SQL relevante

Confirmado via `information_schema` em `qvmtzfvkhkhkhdpclzua`:

```
opportunities
  id               uuid       NOT NULL default gen_random_uuid()
  title            text       NOT NULL
  status           opportunity_status  default 'open'   -- enum: open | won | lost
  amount           numeric    default 0
  created_at       timestamptz default now()
  updated_at       timestamptz default now()
  close_date       date       nullable         -- DATE puro, sem fuso
  contact_id       uuid       nullable  → contacts.id
  owner_user_id    uuid       nullable  → users.id      (INTERNO, não auth.uid())
  organization_id  uuid       NOT NULL
  deleted_at       timestamptz nullable        -- soft delete

organizations
  id                    uuid  NOT NULL
  name                  text  NOT NULL
  slug                  text  NOT NULL
  logo_url              text  nullable
  logo_size             int   default 40
  theme_primary_color   text  default '206 50% 29%'    -- HSL "H S% L%"
  theme_sidebar_color   text  default '0 0% 98%'
  theme_dark_mode       bool  default false
  theme_preset          text  default 'default'        -- 'default' | 'seialz'
  default_currency      text  default 'BRL'
  default_locale        text  default 'pt-BR'
  timezone              text  default 'America/Sao_Paulo'

user_organizations
  user_id                uuid  NOT NULL  → users.id
  organization_id        uuid  NOT NULL
  is_active              bool  default true
  permission_profile_id  uuid  NOT NULL  → permission_profiles.id

users
  id            uuid  NOT NULL  (INTERNO — usar em joins, NÃO auth.uid())
  auth_user_id  uuid  nullable  (= auth.users.id)
  full_name     text  NOT NULL

contacts
  id         uuid  NOT NULL
  full_name  text  NOT NULL
```

---

## 3. Fonte dos dados dos cards e do gráfico

### 3.1 Queries executadas em `fetchStats()`

**Query A — "entradas" (opportunities criadas no período):**

```ts
supabase
  .from('opportunities')
  .select(
    'id, title, status, created_at, updated_at, close_date, amount, contact_id, owner_user_id, ' +
    'contacts:contact_id(full_name), users:owner_user_id(full_name)'
  )
  .eq('organization_id', organization.id)
  .is('deleted_at', null)
  // se !canViewAll     → .eq('owner_user_id', userProfile.id)
  // senão se ownerId!=='all' → .eq('owner_user_id', ownerId)
  .gte('created_at', from.toISOString())
  .lte('created_at', to.toISOString())
  .range(pageFrom, pageTo)   // paginação de 1000 em 1000
```

**Query B — "fechamentos" (won com `close_date` no período):**

```ts
// mesmo baseQuery, mas:
  .eq('status', 'won')
  .gte('close_date', toDayStr(from))   // 'YYYY-MM-DD' LOCAL
  .lte('close_date', toDayStr(to))
```

As duas rodam em `Promise.all`. Depois, `dedupeRowsById([...A, ...B])`. O resultado `opps` alimenta os 3 KPIs, o gráfico de linha e o donut.

### 3.2 Fórmulas dos KPIs (Dashboard.tsx linhas 236–262)

```ts
let entered = 0, closed = 0;
for (const r of rows) {
  const c = new Date(r.created_at).getTime();
  if (c >= fromMs && c <= toMs) entered += 1;

  if (r.status === 'won' && r.close_date) {
    const d = parseLocalDate(r.close_date);   // parse LOCAL, não UTC
    if (d) {
      const u = d.getTime();
      if (u >= fromMs && u <= toMs) closed += 1;
    }
  }
}
const conversion = entered > 0 ? (closed / entered) * 100 : null;
```

- **Entradas** = count de oportunidades com `created_at ∈ [from, to]`.
- **Fechadas** = count de oportunidades com `status === 'won'` **E** `close_date ∈ [from, to]`.
- **Conversão** = `fechadas / entradas × 100`. Pode ser > 100% (fechamentos podem ser de oportunidades criadas fora do período).

### 3.3 Gráfico "Entradas x Fechamentos" (`DashboardTrendChart.tsx`)

- Bucketização: **diária** se período ≤ 90 dias, **semanal** (segunda a domingo) se > 90 dias.
- `Entradas` agrega por `created_at`.
- `Fechamentos` agrega por `close_date` (só `status === 'won'`).
- `close_date` é DATE — sempre parseado como **midnight LOCAL** via `parseLocalDate` (evita shift de fuso).

### 3.4 Donut de status (`DashboardStatusDonut.tsx`)

- Só oportunidades com `created_at ∈ [from, to]`.
- Buckets fixos: `open`, `won`, `lost`. Qualquer valor fora desses três colapsa em `open` (defensivo — o enum atual só tem esses três).

---

## 4. Filtros

### 4.1 Presets de período (`src/lib/report-period.ts`)

```ts
export type PeriodPreset =
  | 'today' | 'yesterday'
  | 'this_week' | 'last_week'
  | 'this_month' | 'last_month'
  | 'last_7' | 'last_30' | 'last_90' | 'last_365'
  | 'custom';

export interface CustomRange { from?: Date; to?: Date }

// computeRange retorna { from, to } com:
//   from = 00:00:00.000 LOCAL
//   to   = 23:59:59.999 LOCAL
//
// Semana começa na SEGUNDA (day===0 domingo vira diff=6).
// last_N são janelas móveis INCLUSIVAS (last_7 = hoje + 6 dias anteriores).
```

Código completo — colar tal qual:

```ts
export function computeRange(
  preset: PeriodPreset,
  custom?: CustomRange,
): { from: Date; to: Date } {
  const now = new Date();
  const today = startOfDay(now);

  switch (preset) {
    case 'today':
      return { from: today, to: endOfDay(now) };
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return { from: y, to: endOfDay(y) };
    }
    case 'this_week': {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const from = new Date(today);
      from.setDate(from.getDate() - diff);
      return { from, to: endOfDay(now) };
    }
    case 'last_week': {
      const day = today.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const thisMonday = new Date(today);
      thisMonday.setDate(thisMonday.getDate() - diff);
      const from = new Date(thisMonday);
      from.setDate(from.getDate() - 7);
      const to = new Date(thisMonday);
      to.setDate(to.getDate() - 1);
      return { from, to: endOfDay(to) };
    }
    case 'this_month': {
      const from = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from, to: endOfDay(now) };
    }
    case 'last_month': {
      const from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const to = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from, to: endOfDay(to) };
    }
    case 'last_7':
    case 'last_30':
    case 'last_90':
    case 'last_365': {
      const days =
        preset === 'last_7' ? 7 : preset === 'last_30' ? 30 : preset === 'last_90' ? 90 : 365;
      const from = new Date(today);
      from.setDate(from.getDate() - (days - 1));
      return { from, to: endOfDay(now) };
    }
    case 'custom': {
      if (custom?.from && custom?.to) return { from: startOfDay(custom.from), to: endOfDay(custom.to) };
      if (custom?.from) return { from: startOfDay(custom.from), to: endOfDay(custom.from) };
      return { from: today, to: endOfDay(now) };
    }
  }
}
```

Conversão para as queries:
- `created_at` → `from.toISOString()` / `to.toISOString()`
- `close_date` → `YYYY-MM-DD` local via `toDayStr(d) = ${y}-${MM}-${DD}` (não usar `.toISOString().slice(0,10)` — shifta em BRT).

### 4.2 Seletor de vendedor

- Só renderiza se `permissions.viewAllOpportunities === true`.
- Query que popula o select (Dashboard.tsx 97–111):

```ts
supabase
  .from('user_organizations')
  .select('user_id, users(id, full_name)')
  .eq('organization_id', organization.id)
  .eq('is_active', true)
// .filter(r => r.users).map(r => ({ id: r.users.id, full_name: r.users.full_name }))
// .sort por full_name
```

- `ownerId === 'all'` → sem filtro de owner.
- `ownerId === <uuid>` → `.eq('owner_user_id', ownerId)`.
- Usuário SEM `viewAllOpportunities` é forçado a `owner_user_id = userProfile.id` (só vê o próprio).

### 4.3 Permissões (`src/hooks/usePermissions.ts`)

Lê `user_organizations.permission_profile_id` → `permission_profiles.permissions` (JSONB). Flag relevante: `view_all_opportunities` → mapeada para `permissions.viewAllOpportunities`. Cache de 10 min via React Query.

### 4.4 Persistência de filtros (`src/hooks/usePersistedFilters.ts`)

Chave: `seialz:filters:v1:${userId}:${orgId}:${scope}`.
Escopos usados na Dashboard:
- `dashboard.preset` → `PeriodPreset` (default `'today'`)
- `dashboard.custom` → `CustomRange` (reviver converte strings ISO em `Date`)
- `dashboard.ownerId` → `string` (default `'all'`)

**Porting Expo:** trocar `localStorage.getItem/setItem/removeItem` por `AsyncStorage.getItem/setItem/removeItem` (async — envolver em `useEffect` com `await`).

---

## 5. Tema por organização

### 5.1 Colunas em `organizations`

| Coluna                | Tipo    | Default          | Observação                                                                 |
|-----------------------|---------|------------------|----------------------------------------------------------------------------|
| `theme_primary_color` | text    | `'206 50% 29%'`  | HSL string "H S% L%". **NÃO é hex.** Ex. verde: `'142 71% 45%'`.           |
| `theme_sidebar_color` | text    | `'0 0% 98%'`     | Mesmo formato HSL.                                                          |
| `theme_dark_mode`     | bool    | `false`          |                                                                             |
| `theme_preset`        | text    | `'default'`      | `'default' \| 'seialz'`. Se `seialz`, ignora `theme_primary_color`.        |
| `logo_url`            | text    | `null`           | URL absoluta (Storage do Supabase ou externa).                              |
| `logo_size`           | int     | `40`             | Tamanho renderizado do logo em px.                                          |

Lidas no select central de `OrganizationContext.tsx` (linha 91):

```ts
.select('organization:organizations(id, name, slug, logo_url, logo_size, default_currency, default_locale, timezone, enable_companies_module, onboarding_step, onboarding_completed_at, duplicate_check_mode, duplicate_enforce_block, theme_primary_color, theme_sidebar_color, theme_dark_mode, cs_inbox_includes_service_endpoints)')
```

> `theme_preset` é lido separadamente em `ThemeContext.tsx` como `(organization as any).theme_preset` — incluir no seu select do Expo.

### 5.2 Como o web aplica (`src/contexts/ThemeContext.tsx`) — arquivo completo

```tsx
import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useOrganization } from '@/hooks/useOrganization';

type ThemePreset = 'default' | 'seialz';

interface ThemeContextType {
  primaryColor: string;
  sidebarColor: string;
  darkMode: boolean;
  themePreset: ThemePreset;
  setPrimaryColor: (color: string) => void;
  setSidebarColor: (color: string) => void;
  setDarkMode: (enabled: boolean) => void;
  setThemePreset: (preset: ThemePreset) => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

const DEFAULT_PRIMARY = '206 50% 29%';
const DEFAULT_SIDEBAR = '0 0% 98%';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const { organization } = useOrganization();

  const [primaryColor, setPrimaryColor] = useState(DEFAULT_PRIMARY);
  const [sidebarColor, setSidebarColor] = useState(DEFAULT_SIDEBAR);
  const [darkMode, setDarkMode] = useState(false);
  const [themePreset, setThemePreset] = useState<ThemePreset>('default');

  useEffect(() => {
    if (organization) {
      setPrimaryColor(organization.theme_primary_color || DEFAULT_PRIMARY);
      setSidebarColor(organization.theme_sidebar_color || DEFAULT_SIDEBAR);
      setDarkMode(organization.theme_dark_mode || false);
      const preset = (organization as any).theme_preset as string | null;
      setThemePreset((preset === 'seialz' ? 'seialz' : 'default'));
    }
  }, [organization?.id]);

  // (efeitos DOM omitidos — no Expo, virar objeto de tokens no context)
  // primary-foreground calculado por luminosidade:
  //   const lightness = parseInt(primaryColor.split(' ')[2]?.replace('%','') || '50');
  //   const fg = lightness > 65 ? '217 33% 17%' : '0 0% 100%';

  return (
    <ThemeContext.Provider value={{ primaryColor, sidebarColor, darkMode, themePreset,
      setPrimaryColor, setSidebarColor, setDarkMode, setThemePreset }}>
      {children}
    </ThemeContext.Provider>
  );
}
```

**Porting Expo:**

```ts
// Parse HSL "H S% L%" → objeto usável
function parseHsl(s: string) {
  const [h, sat, l] = s.split(' ').map(v => parseFloat(v));
  return { h, s: sat, l };
}
function toCss({ h, s, l }: { h: number; s: number; l: number }) {
  return `hsl(${h}, ${s}%, ${l}%)`;
}

// primary-foreground = branco ou grafite conforme luminosidade
const fg = parseHsl(primaryColor).l > 65 ? 'hsl(217, 33%, 17%)' : '#fff';
```

Sem CSS vars no RN: exponha `{ primary, sidebar, darkMode, preset }` via `ThemeContext` e consuma em cada `StyleSheet`/`styled`.

---

## 6. Código-fonte (colar literal no Expo)

Os arquivos abaixo são a fonte da verdade. Para não duplicar o dump, ler direto no repo web:

| Arquivo web                                           | Papel no Expo                                      |
|-------------------------------------------------------|----------------------------------------------------|
| `src/pages/Dashboard.tsx`                             | Página completa, orquestra queries + KPIs.         |
| `src/components/mobile/MobileDashboard.tsx`           | Versão mobile já existente — melhor referência de porting. |
| `src/components/reports/ReportFilters.tsx`            | Select de preset + inputs de custom + owner.       |
| `src/lib/report-period.ts`                            | `computeRange`, tipos. **Copiar 1:1 no Expo.**     |
| `src/components/reports/DashboardTrendChart.tsx`      | Gráfico linha (recharts → victory-native).         |
| `src/components/reports/DashboardStatusDonut.tsx`     | Donut status (recharts → victory-native).          |
| `src/lib/fetchAllPagedRows.ts`                        | Paginação 1000/página + `dedupeRowsById`. **Copiar 1:1.** |
| `src/hooks/usePersistedFilters.ts`                    | Trocar `localStorage` por `AsyncStorage`.          |
| `src/hooks/usePermissions.ts`                         | Copiar 1:1 (usa Supabase JS + React Query).        |
| `src/contexts/OrganizationContext.tsx`                | Ver `docs/mobile/backend-reference.md` para port.        |
| `src/contexts/ThemeContext.tsx`                       | Adaptar conforme seção 5.                          |

### 6.1 `src/lib/fetchAllPagedRows.ts` (literal, copiar 1:1)

```ts
type PagedResult<T> = {
  data: T[] | null;
  error: { message?: string } | null;
};

export async function fetchAllPagedRows<T>(
  fetchPage: (from: number, to: number) => Promise<PagedResult<T>>,
  pageSize = 1000,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 200; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) throw new Error(error.message || 'Erro ao buscar dados paginados');
    const batch = data || [];
    rows.push(...batch);
    if (batch.length < pageSize) return rows;
  }
  return rows;
}

export function dedupeRowsById<T extends { id: string }>(rows: T[]): T[] {
  const map = new Map<string, T>();
  for (const row of rows) map.set(row.id, row);
  return Array.from(map.values());
}
```

### 6.2 Helpers de data (Dashboard.tsx — copiar 1:1)

```ts
const parseLocalDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return new Date(s);
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
};

const toDayStr = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
```

---

## 7. Notas de porting Expo

- `localStorage` → `@react-native-async-storage/async-storage` (API async).
- `recharts` → `victory-native` (`VictoryLine`, `VictoryPie`) ou `react-native-svg-charts`.
- CSS vars/HSL string → parse para `hsl(h, s%, l%)` e passar via `ThemeContext` do RN.
- `useNavigate('/opportunities/:id')` → `navigation.navigate('OpportunityDetail', { id })` (React Navigation).
- `<Dialog>` do shadcn (detalhe de "entered/closed") → `Modal` nativo do RN ou `@gorhom/bottom-sheet`.
- **NUNCA** parsear `close_date` com `new Date('YYYY-MM-DD')` — vira UTC e shifta 1 dia em BRT. Use `parseLocalDate` acima.
- Manter uso de `users.id` (interno) em todos os filtros por owner — **jamais** usar `auth.uid()` direto. Ver `docs/mobile/backend-reference.md` seção "SQL Helpers".
