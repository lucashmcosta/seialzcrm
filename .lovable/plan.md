
# Two Small Improvements to the Messages Module

## Change 1: Blue dot always visible when last message is from the client

### Current behavior
The blue dot in the conversation list (`ChatListItem`) only appears when `value.unread === true`. This means if an agent has already read a message but hasn't replied, the dot disappears and there's no visual indicator that the last message was inbound (from the client).

### Desired behavior
The blue dot should always be shown (even if read) when the last message in the thread came from the client (`last_message_direction === 'inbound'`). The dot can stay the same blue color (`bg-primary`) — it now serves double duty as an "unread" indicator and an "unanswered inbound" indicator.

### Implementation
In `ChatListItem` (lines 161-163 of `MessagesList.tsx`), change the condition from:

```tsx
// Before — only shows if unread
{value.unread && (
  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
)}
```

To:

```tsx
// After — shows if unread OR last message is from client
{(value.unread || value.last_message_direction === 'inbound') && (
  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
)}
```

---

## Change 2: Add "Tornar persuasivo" option to the AI menu

### Current options (3)
1. Corrigir gramática (`grammar`)
2. Tornar profissional (`professional`)
3. Tornar amigável (`friendly`)

### New option (4th)
**Tornar persuasivo** (`persuasive`) — rewrites the text with persuasive language aimed at converting/engaging the prospect.

### Implementation

**Step 1 — Extend the type in `handleImproveText`** (line 259):

```typescript
// Before
const handleImproveText = async (mode: 'grammar' | 'professional' | 'friendly') => {

// After
const handleImproveText = async (mode: 'grammar' | 'professional' | 'friendly' | 'persuasive') => {
```

**Step 2 — Add the menu item** in the `DropdownMenuContent` (after line 1248, after the "Tornar amigável" item):

```tsx
<DropdownMenuItem onClick={() => handleImproveText('persuasive')}>
  <Target className="h-4 w-4 mr-2" />
  {locale === 'pt-BR' ? 'Tornar persuasivo' : 'Make persuasive'}
</DropdownMenuItem>
```

Use the `Target` icon from `lucide-react` (already installed). Add `Target` to the existing lucide-react import on line 39.

**Step 3 — The `ai-generate` edge function** already handles the `improve_text` action and receives `{ text, mode }` in the context. The `persuasive` mode value will be passed through, and the AI prompt should handle it naturally. No edge function changes needed — the AI will interpret the `persuasive` mode and apply persuasive copywriting techniques.

---

## Files to change

| File | Lines | Change |
|------|-------|--------|
| `src/pages/messages/MessagesList.tsx` | 39 | Add `Target` to lucide-react imports |
| `src/pages/messages/MessagesList.tsx` | 161-163 | Show dot when `unread OR last_message_direction === 'inbound'` |
| `src/pages/messages/MessagesList.tsx` | 259 | Add `'persuasive'` to the mode union type |
| `src/pages/messages/MessagesList.tsx` | 1245-1249 | Add new `DropdownMenuItem` for "Tornar persuasivo" |

All changes are in a single file — small and contained.
