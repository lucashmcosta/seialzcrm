

## Fix: Pipeline/Stage Select Not Working in Integration Dialog

### Problem
Two issues:

1. **`DialogContent` has `overflow-hidden`** (line 56 of `dialog.tsx`) — this clips native `<select>` dropdown menus, making it impossible to see or select options when the dropdown extends beyond the dialog bounds.

2. **Dialog content doesn't scroll** — when the WhatsApp integration dialog has many sections (status, webhooks, inbound settings), the content overflows without scrolling, hiding the pipeline/stage selectors.

### Changes

**`src/components/settings/IntegrationDetailDialog.tsx`**
- Add `overflow-y-auto max-h-[80vh]` to the `DialogContent` className so the dialog scrolls when content is tall.

**`src/components/settings/WhatsAppInboundSettings.tsx`**
- No changes needed — native `<select>` will work once overflow is fixed.

The `overflow-hidden` on the base `DialogContent` is intentional for most dialogs, so rather than changing the global component, we override it specifically on this dialog instance with `overflow-y-auto`.

