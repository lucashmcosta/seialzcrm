

## Fix: Message Preview Truncation + Relative Date Formatting

### Changes

#### 1. `src/components/mobile/MobileMessagesList.tsx`

**Line 101-119 — Replace `formatRelativeTime`** with WhatsApp-style date formatting:
- Today → time only (e.g. "14:30")
- Yesterday → "Ontem" / "Yesterday"
- Last 7 days → day name (e.g. "Quinta")
- Older → short date DD/MM/YY

**Line 771 — Fix message preview truncation**: Change `<p className="text-xs text-muted-foreground truncate mt-0.5">` to use `line-clamp-2` instead of `truncate` (which only does 1 line). This allows 2-line previews with ellipsis.

### Files affected
- `src/components/mobile/MobileMessagesList.tsx` — both fixes in this single file

