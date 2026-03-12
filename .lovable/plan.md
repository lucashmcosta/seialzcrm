

## Add Tags to Opportunity Detail Page

### Problem
Tags (etiquetas) are configured in Settings but there's no UI to assign/view them on the Opportunity Detail page.

### Database
Already exists: `tag_assignments` table with `organization_id`, `tag_id`, `entity_type`, `entity_id`. We use `entity_type = 'opportunity'` and `entity_id = opportunity.id`.

### Changes

**New component: `src/components/common/TagSelector.tsx`**
- Reusable component that works for both contacts and opportunities
- Props: `entityType` ('contact' | 'opportunity'), `entityId`, `organizationId`
- Fetches all org tags and current assignments
- Displays assigned tags as colored badges with X to remove
- Has a popover/dropdown to add tags (shows unassigned tags)
- Insert/delete from `tag_assignments` table

**`src/pages/opportunities/OpportunityDetail.tsx`**
- Import and render `TagSelector` in the overview tab, below the status badge section
- Pass `entityType="opportunity"`, `entityId={opportunity.id}`, `organizationId={organization.id}`

### UI Design
- Show assigned tags as small colored badges (using each tag's `color` field)
- Click "+" button to open a popover listing available tags
- Click a tag to assign it; click X on a badge to remove it
- Matches the existing visual style (small section in the right column of overview)

