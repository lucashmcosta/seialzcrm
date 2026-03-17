

## Replace AudioMessagePlayer with WhatsApp-style Waveform Player

The `useIsMobile` fix is already applied. The remaining task is to replace the current basic `AudioMessagePlayer` (slider + play/pause) with the WhatsApp-native-style audio player you provided (waveform bars, seek dot, WhatsApp dark theme colors).

### Changes

#### 1. `src/components/whatsapp/AudioMessagePlayer.tsx` — Full rewrite

Replace the current Slider-based player with the waveform-style player from your reference code. Key adaptations:

- **Keep the existing interface** (`src: string, className?: string`) so all 5 consumer files (MobileMessagesList, WhatsAppChat, MessagesList, ContactMessages, AudioMessagePlayer itself) continue to work without changes
- **Remove** unused props from your demo (isOutgoing, senderName, senderInitials, timestamp, status, avatar) — those are already handled by the parent bubble components
- **Convert to TypeScript** with proper types
- **Use `requestAnimationFrame`** for smooth waveform progress (from your code) instead of the `timeupdate` event
- **Waveform visualization**: 40 random bars with green (#00A884) for played / dark (#3B5249) for unplayed
- **Seek on click/touch** on the waveform area
- **Draggable seek dot** over the waveform
- **Keep inline styles** matching WhatsApp dark theme (consistent with your reference)

The component will render as a self-contained player row (play button + waveform + time) without the bubble/avatar wrapper, since the parent components already handle message bubble styling.

#### Files affected
- `src/components/whatsapp/AudioMessagePlayer.tsx` — rewrite only, no import changes needed anywhere

