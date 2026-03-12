

## Show Tags on Kanban Cards + Filter by Tag

### Changes

**1. `src/components/opportunities/OpportunityCard.tsx`**
- Add optional `tags` prop: `{ id: string; name: string; color: string | null }[]`
- Render tags as small colored badges between contact name and amount sections

**2. `src/pages/opportunities/OpportunitiesKanban.tsx`**
- Fetch all tags for the organization (`tags` table)
- Fetch all tag assignments where `entity_type = 'opportunity'` for the org
- Build a map: `opportunityId → Tag[]` and pass to each `OpportunityCard`
- Add `filterTag` state (default `'all'`)
- Add tag filter dropdown in the Filters popover (after Responsável)
- Apply tag filter in `getOpportunitiesForStage` and `filteredOpportunities`
- Include tag filter in `activeFiltersCount` and `clearFilters`

### UI
- Tags on cards: tiny colored pills (matching TagSelector style), max 3 visible + "+N" overflow
- Filter: standard Select dropdown listing all org tags by name

