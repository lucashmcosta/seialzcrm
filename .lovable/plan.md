

## Fix: Audio Message Bubble Too Tall

The bubble's vertical padding comes from `p-2.5` (10px all sides) on the parent bubble `div` at line 915 of `MobileMessagesList.tsx`. The audio player itself already has tight padding (`2px 2px`). The fix is to reduce the bubble padding specifically when the message is audio-only.

### Changes

#### 1. `src/components/mobile/MobileMessagesList.tsx` (~line 915)
The bubble container uses `p-2.5` universally. For audio-only messages (no text content, media_type is audio), reduce padding to `p-1` or `px-1.5 py-1`. 

Approach: Add a conditional class — if the message has audio media and no text content, use `p-1` instead of `p-2.5`.

#### 2. Same change in `src/components/whatsapp/WhatsAppChat.tsx` and `src/pages/messages/MessagesList.tsx`
Apply the same conditional padding reduction for audio messages in the desktop chat views for consistency.

#### 3. `src/components/whatsapp/AudioMessagePlayer.tsx` (line 88)
Reduce the container padding from `padding: '2px 2px'` to `padding: '0px 2px'` and reduce the gap from `8` to `6` to tighten the player internally.

Also reduce `marginTop: 2` on the duration text div (line 171) to `marginTop: 0`.

### Files affected
- `src/components/mobile/MobileMessagesList.tsx`
- `src/components/whatsapp/WhatsAppChat.tsx`
- `src/pages/messages/MessagesList.tsx`
- `src/components/whatsapp/AudioMessagePlayer.tsx`

