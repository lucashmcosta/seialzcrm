

## Instalar Phosphor Icons + Design System + Atualizar Landing

### 1. Instalar dependência

- **`package.json`**: Adicionar `"@phosphor-icons/react": "^2.1.7"`

### 2. Criar `docs/ICON_SYSTEM.md`

Documentação completa do sistema de ícones baseada no documento enviado:
- Peso padrão: `light` (UI), `bold` (ênfase), `fill` (ativo)
- Mapeamento módulo → ícone (Dashboard=ChartLineUp, Pipeline=Funnel, Leads=UsersThree, etc.)
- Ações: Plus, PencilSimple, TrashSimple, MagnifyingGlass
- Status: CheckCircle, WarningCircle, XCircle, Info
- Tamanhos: 16/20/24/32/48px
- Cores: `#00FF88` on dark, `#00884A` on light, `#5A5A66` muted
- Importação correta: `import { Robot, PhoneCall, Target } from "@phosphor-icons/react"` (sem sufixo "Icon")

### 3. Atualizar `src/pages/LandingPage.tsx`

Trocar ícones Lucide pelos Phosphor equivalentes com weight `light`:
- `Target` → `Target`
- `Phone` → `PhoneCall`
- `Brain` → `Robot`
- `BarChart3` → `ChartLineUp`
- `Users` → `UsersThree`
- `Zap` → `Lightning`
- `MessageSquare` → `ChatCircle`
- `Shield` → `Shield`
- `TrendingUp` → `TrendUp`
- `CheckCircle` → `CheckCircle`
- Etc. (mapear todos os ícones usados)

