

## Mobile Layout for Opportunities Kanban

### Current State
- OpportunitiesKanban uses `Layout` (desktop sidebar) on all screen sizes — no mobile detection
- Dashboard already has the pattern: `useIsMobile()` → renders `MobileLayout` + mobile-specific content on small screens
- Kanban columns are fixed 272px width, the topbar (SeialzTopbar) has desktop-only controls (search, view switcher, filters)

### Plan

**1. Create `MobileOpportunitiesKanban` component**
New file: `src/components/mobile/MobileOpportunitiesKanban.tsx`

A mobile-optimized opportunities view with:
- **Pipeline summary header**: Total deals count + total pipeline value (compact, using `font-data`)
- **Stage tabs**: Horizontal scrollable chips/pills showing stage names + count — tap to filter by stage
- **Card list**: Vertical list of `SeialzOpportunityCard` for the selected stage (no drag-drop on mobile)
- **FAB or sticky button**: "+" button to create new opportunity
- **Pull-to-see-more**: Reuse the infinite scroll sentinel pattern from desktop
- **Search**: Compact search input at the top
- No view switcher (kanban columns don't work on 390px), no table view on mobile

**2. Update `OpportunitiesKanban.tsx`**
- Import `useIsMobile` and `MobileLayout`
- Early return with `MobileLayout` + `MobileOpportunitiesKanban` when `isMobile` is true
- Pass down the existing data-fetching logic (stages, opportunities, counts, filters, handlers) via props or keep fetching in the parent

**3. Architecture approach**
Keep all data fetching in `OpportunitiesKanban.tsx` (parent), pass data as props to the mobile component. This avoids duplicating queries. The mobile component is purely presentational + interactions.

### Mobile component structure
```text
┌─────────────────────────────┐
│ MobileLayout header (56px)  │
├─────────────────────────────┤
│ 🔍 Search input             │
│ 42 deals · R$ 1.2M          │
├─────────────────────────────┤
│ [Novo] [Em negociação] [Ganho] [Perdido]  ← horizontal scroll chips
├─────────────────────────────┤
│ ┌───────────────────────┐   │
│ │ Deal Card             │   │
│ │ Contact · R$ 5.000    │   │
│ └───────────────────────┘   │
│ ┌───────────────────────┐   │
│ │ Deal Card             │   │
│ └───────────────────────┘   │
│ ...infinite scroll...       │
├─────────────────────────────┤
│ [+] FAB button (fixed)      │
├─────────────────────────────┤
│ Bottom tab bar (56px)       │
└─────────────────────────────┘
```

### Files affected
| File | Change |
|------|--------|
| `src/components/mobile/MobileOpportunitiesKanban.tsx` | **New** — mobile opportunities view |
| `src/pages/opportunities/OpportunitiesKanban.tsx` | Add `useIsMobile` check, early return with mobile layout |

### Design tokens
- Uses Seialz design system: `font-data`, `hsl(var(--sz-*))` tokens, 6px border-radius
- Stage chips with `STAGE_COLORS` from existing code
- Cards reuse existing `SeialzOpportunityCard` component

