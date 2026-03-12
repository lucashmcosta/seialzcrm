

## Fix: "Create Opportunity" from Contact Detail

### Problem
The "Create Opportunity" button in `ContactOpportunities` navigates to `/opportunities/new?contact=${contactId}`, but **no route exists** for `/opportunities/new`. The route `/opportunities/:id` catches it, treating "new" as an opportunity ID, and `OpportunityDetail` tries to fetch an opportunity with `id="new"` — which fails.

### Solution
Replace the navigation link with an inline `OpportunityDialog` (the same dialog used in `OpportunitiesKanban`). This opens a create dialog directly from the contact page with the contact pre-selected.

### Changes

**`src/components/contacts/ContactOpportunities.tsx`**
- Remove the `Link` to `/opportunities/new`
- Add state for dialog open/close and pipeline stages
- Fetch pipeline stages on mount
- Render `OpportunityDialog` with the contact pre-selected
- On success, refresh the opportunities list

Key structure:
```tsx
const [dialogOpen, setDialogOpen] = useState(false);
const [stages, setStages] = useState([]);

// Fetch stages on mount
// Button opens dialog instead of navigating
<Button onClick={() => setDialogOpen(true)}>...</Button>

<OpportunityDialog
  open={dialogOpen}
  onOpenChange={setDialogOpen}
  stages={stages}
  onSuccess={() => { setDialogOpen(false); fetchOpportunities(); }}
/>
```

The `OpportunityDialog` already supports a `contact_id` in its form data via `opportunity` prop — we pass the contactId as a pre-filled opportunity to set the contact automatically.

