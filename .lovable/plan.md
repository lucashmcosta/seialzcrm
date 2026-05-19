# Fix TDZ in OutboundCallContext.tsx

## Root cause

`src/contexts/OutboundCallContext.tsx` is imported in two ways:

- Eagerly from `src/App.tsx` (`OutboundCallProvider`)
- Lazily via the `OutboundCallHandler` lazy chunk and lazy pages (`ContactDetail`, `OutboundCallModal`, `ContactCalls`) that pull `useOutboundCall` / `CallStatus`

Because the same module also statically imports the heavy `@twilio/voice-sdk` at top level, Vite places shared symbols (the `OutboundCallContext` token + Twilio SDK bindings) into a shared chunk that is referenced from the eager `index-*.js` before that chunk's `const` bindings are initialized. The minified symbol `Lt` is the context token / a Twilio SDK binding in that shared chunk — accessed in its Temporal Dead Zone → `Cannot access 'Lt' before initialization`.

The fix is purely structural: separate the **module surface that consumers import** (context token + hook + types) from the **provider implementation** (which owns Twilio side effects), and move the `@twilio/voice-sdk` import inside the provider so it is only evaluated when the provider mounts.

No behavior changes. No Twilio features removed.

## File plan

### 1. New file: `src/contexts/outbound-call/types.ts`
Pure type-only module (no runtime side effects).
- `CallStatus` (re-exported)
- `CallInfo`, `TokenCache`, `OutboundCallContextType` interfaces

### 2. New file: `src/contexts/outbound-call/context.ts`
- `createContext` call → `OutboundCallContext`
- `useOutboundCall()` hook
- Re-exports `CallStatus` type

Imports: only React + `./types`. No Twilio, no Supabase. This is the module every consumer (lazy pages, handlers, modals) imports — guaranteed cycle-free and side-effect-free.

### 3. Rewrite: `src/contexts/OutboundCallContext.tsx`
- Re-exports `useOutboundCall`, `CallStatus` from `./outbound-call/context` (preserves the public API path that all existing consumers import — zero changes outside this folder).
- Defines `OutboundCallProvider` using the context token imported from `./outbound-call/context`.
- Moves `import { Device, Call } from '@twilio/voice-sdk'` from top-level to a **dynamic import inside `initializeDevice`** (`const { Device, Call } = await import('@twilio/voice-sdk')`). This removes the eager Twilio SDK from the provider module's static graph, breaking the shared-chunk TDZ.
- `deviceRef`/`activeCallRef` typing: use `any` (or import `type { Device, Call }` — type-only imports are erased at runtime and do not cause the chunk issue).
- All logic preserved verbatim: token fetching, voice integration check, device registration, inbound/outbound handlers, realtime status subscription, mute, DTMF, cleanup, fullCleanup on unmount, GlobalCallHandler integration (unchanged — it imports from the same path).

### 4. No changes to
- `src/App.tsx` (still imports `OutboundCallProvider` from `@/contexts/OutboundCallContext`)
- `src/components/calls/OutboundCallHandler.tsx`
- `src/components/calls/OutboundCallModal.tsx`
- `src/components/contacts/ContactCalls.tsx`
- `src/pages/contacts/ContactDetail.tsx`
- `src/lib/authSession.ts`

All consumer import paths stay `@/contexts/OutboundCallContext` — the barrel re-exports keep their public API intact.

## Why this prevents the circular/TDZ initialization

1. The **context token** lives in a tiny leaf module (`context.ts`) with no Twilio/Supabase deps, so lazy chunks and the eager provider share one identical binding without pulling heavy modules into the shared chunk.
2. **`@twilio/voice-sdk` is no longer in the static graph** of any eagerly-loaded module. It is fetched on first `initializeDevice()` call, after auth + voice-integration checks already pass. The eager `index-*.js` never references Twilio bindings → no TDZ on `Lt`.
3. **Type-only imports** of `Device`/`Call` are erased by esbuild → zero runtime references in the eager bundle.

Inline comments in the new files will explain these constraints so future edits do not regress.

## Verification

After the refactor:
1. `bun run build` succeeds.
2. Serve `dist/` and load `/` and `/dashboard` — app boots, no blank screen, no `Cannot access 'Lt' before initialization` in console.
3. `OutboundCallProvider` mounts (verify via React DevTools / a one-line console.log added during verification then removed).
4. Trigger an outbound call from `ContactDetail` → device initializes (dynamic import of `@twilio/voice-sdk` happens here), token is fetched, call connects, status updates flow, mute/DTMF work, end-call cleanup runs.
5. Unmount cleanup (`fullCleanup`) runs on logout/navigation away from CRM.
