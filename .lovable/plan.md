

## Fix: Template Selector Layout in Messages

The template selector view has two layout problems:

1. **Parent container**: The `flex-1 overflow-hidden` div doesn't use flex-col, so the `ScrollArea` with `flex-1` doesn't expand properly
2. **Internal ScrollArea cap**: `WhatsAppTemplateSelector` has a hardcoded `max-h-[300px]` on its template list, cutting off content unnecessarily

### Changes

**`src/pages/messages/MessagesList.tsx` (lines 1371-1386)**
- Add `flex flex-col` to the outer container so `flex-1` on the ScrollArea works
- Remove the redundant header since `WhatsAppTemplateSelector` already has its own header/cancel button — OR keep the header but ensure proper flex layout

**`src/components/whatsapp/WhatsAppTemplateSelector.tsx`**
- Remove `max-h-[300px]` from the `ScrollArea` so it fills available space naturally
- Change to `flex-1 overflow-auto` pattern so templates use all available vertical space
- Wrap the component in a flex-col container with `h-full`

### Result
Templates will fill the full chat area height with proper scrolling, matching the rest of the messages UI.

