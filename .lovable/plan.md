

## Fix: Audio Player Duration/Timestamp Alignment (Full Match)

### Problem
1. Duration text ("0:03") starts under the play button instead of under the waveform
2. The parent footer (timestamp + checkmarks) is rendered outside the AudioMessagePlayer, creating misalignment
3. For audio-only messages, the footer timestamp should align with the duration row

### Analysis

The AudioMessagePlayer component (line 173) already has `marginLeft: 34` on its Row 2. Looking at the current code, this should be working. Let me check if the issue is that the parent footer row (timestamp + checkmarks) rendered outside the player is the one causing visual problems.

There are 3 parent rendering contexts:
- **MessagesList.tsx** (line 1548): Footer with `text-[10px]` timestamp + status icons
- **MobileMessagesList.tsx** (line 965): Footer with `text-[9px]` timestamp + status icons  
- **WhatsAppChat.tsx** (line 471): Footer with `text-xs` timestamp + status icons

For audio-only messages (no text content), the parent footer sits below the AudioMessagePlayer and is right-aligned, creating the visual disconnect.

### Plan

**1. AudioMessagePlayer.tsx — Ensure Row 2 has marginLeft: 34**
Already has it (line 173). Verify it's correct and ensure duration text is `fontSize: 11, lineHeight: '14px'`.

**2. MessagesList.tsx — For audio messages, move footer inside player alignment**
Around line 1547-1565, when the message is audio-only, add `marginLeft: 34` to the footer div and set timestamp to `fontSize: 11px` (matching duration), so both rows align under the waveform.

**3. MobileMessagesList.tsx — Same fix for mobile**
Around line 965-970, same pattern: for audio-only messages, align footer under waveform with `marginLeft: 34` and `fontSize: 11px`.

**4. WhatsAppChat.tsx — Same fix for WhatsApp chat widget**
Around line 471-480, same alignment fix for audio-only message footers.

### Detection logic
Audio-only = `message.media_type === 'audio' && !message.content`

### Changes per file

| File | Change |
|------|--------|
| `AudioMessagePlayer.tsx` | Confirm marginLeft: 34 on Row 2, both texts at 11px/14px line-height |
| `MessagesList.tsx` | Footer div: add conditional `ml-[34px]` + `text-[11px]` when audio-only |
| `MobileMessagesList.tsx` | Same conditional styling on footer |
| `WhatsAppChat.tsx` | Same conditional styling on footer |

No changes to waveform, play button, bubble padding, or colors.

