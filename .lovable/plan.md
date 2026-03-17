

## Fix: Outgoing Message Bubble Colors

### Problem
Both mobile (`MobileMessagesList.tsx`) and desktop (`WhatsAppChat.tsx`) chat views use `bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100` for outgoing bubbles — washed out, low contrast, not native-feeling.

### Changes

#### 1. `src/components/mobile/MobileMessagesList.tsx` (line 916-918)
Replace outgoing bubble classes:
```
- 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100'
+ 'bg-[#054D3E] text-white'
```

Update timestamp color (line 965):
```
- 'text-[9px] text-muted-foreground/70'
+ 'text-[9px]' + conditional: isOutbound ? 'text-white/60' : 'text-muted-foreground/70'
```

#### 2. `src/components/whatsapp/WhatsAppChat.tsx` (line 452-454)
Same bubble color change:
```
- 'bg-green-100 dark:bg-green-900/40 text-green-900 dark:text-green-100'
+ 'bg-[#054D3E] text-white'
```

Update timestamp (line 473):
```
- 'text-xs text-muted-foreground'
+ conditional: isOutbound ? 'text-xs text-white/60' : 'text-xs text-muted-foreground'
```

#### 3. `src/components/whatsapp/WhatsAppFormattedText.tsx`
Update link color class to work on dark green background — change from `text-blue-500` to `text-[#A0E4D0]` so links remain distinguishable inside outgoing bubbles. Since this component is used in both incoming and outgoing contexts, we should pass a prop or use a CSS approach. Simplest: change link class to `text-blue-400 underline` which works on both dark backgrounds.

#### 4. `src/components/whatsapp/QuotedMessage.tsx`
The quoted message inside outgoing bubbles uses `bg-muted/50` which won't contrast well on dark green. No change needed — `bg-muted/50` with `border-primary` should still be readable on the dark green background.

### Files affected
- `src/components/mobile/MobileMessagesList.tsx` — bubble + timestamp colors
- `src/components/whatsapp/WhatsAppChat.tsx` — bubble + timestamp colors
- `src/components/whatsapp/WhatsAppFormattedText.tsx` — link color adjustment

