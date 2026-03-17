
Goal: make the audio player exactly compact (~43px total), with waveform centered and duration tight under it, in `src/components/whatsapp/AudioMessagePlayer.tsx` only.

Planned changes (exact values):

1) Convert player wrapper to 2-row layout (column)
- Current wrapper (`line ~88`) is a horizontal row.
- Change to:
  - `display: 'flex'`
  - `flexDirection: 'column'`
  - `gap: 1`
  - `padding: 2`
  - keep existing `maxWidth: 240`, `minWidth: 200`
- This enforces:
  - Row 1 = controls/waveform
  - Row 2 = info text row
  - Total vertical stack target: `24 + 1 + 14 + 4 = 43px`

2) Row 1 (play + waveform) exact spec
- Add Row 1 container:
  - `display: 'flex'`
  - `alignItems: 'center'`
  - `gap: 6`
  - `height: 24`
- Play button wrapper:
  - `width: 28`
  - `height: 28`
  - `display: 'flex'`
  - `alignItems: 'center'`
  - `justifyContent: 'center'`
  - `padding: 0`
  - `margin: 0`
  - no `alignSelf` override
- Play/Pause SVG:
  - `width="14"` and `height="14"` (color unchanged)
- Waveform container:
  - `flex: 1`
  - `height: 24`
  - `display: 'flex'`
  - `alignItems: 'center'`
  - `gap: 1.5`
  - `position: 'relative'`
- Keep waveform bars unchanged (count/colors/width logic unchanged), seek dot unchanged.

3) Row 2 (duration row) tight under waveform
- Add Row 2 container directly below Row 1:
  - `display: 'flex'`
  - `justifyContent: 'space-between'`
  - `alignItems: 'center'`
  - `padding: 0`
  - `margin: 0`
- Duration text:
  - `fontSize: 11`
  - `lineHeight: '14px'`
  - keep existing color `rgba(255,255,255,0.6)`
- Remove any extra spacing between waveform and duration:
  - no `marginTop`
  - no extra vertical padding anywhere in player internals
  - only the wrapper `gap: 1` defines separation

4) Guardrails (explicitly not changing)
- No change to waveform bar colors/count/width settings
- No change to play icon color
- No change to bubble padding in parent components
- No other files touched
