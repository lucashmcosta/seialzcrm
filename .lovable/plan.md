

## Fix: Align Play Button Vertically with Waveform

### Root Cause
The right column contains the waveform (20px) **plus** the duration text below (~15px), making the column ~35px tall. The parent flex uses `alignItems: 'center'`, so the 30px play button centers against the full 35px column — shifting it slightly below the waveform's midpoint.

### Fix
In `src/components/whatsapp/AudioMessagePlayer.tsx`, make the duration text not contribute to the column's layout height by positioning it absolutely. This way the right column's height equals the waveform height (20px), and the existing `alignItems: 'center'` correctly centers the play button with the waveform.

**Line 123** — Add `position: 'relative'` to the right column div:
```tsx
<div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
```

**Line 171** — Make the duration text absolutely positioned below the waveform:
```tsx
<div style={{ position: 'absolute', left: 0, top: 20, display: 'flex', justifyContent: 'flex-start' }}>
```

**Line 123** — Add bottom padding to the column to reserve space for the absolute-positioned duration text so it doesn't clip:
```tsx
<div style={{ flex: 1, minWidth: 0, position: 'relative', paddingBottom: 14 }}>
```

Single file affected: `src/components/whatsapp/AudioMessagePlayer.tsx` — alignment only, no visual changes to waveform, icons, or colors.

