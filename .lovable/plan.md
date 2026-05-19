# Plan: Bisect and Fix `Cannot access 'Lt' before initialization`

The error is a TDZ (temporal dead zone) hit in the production bundle. `madge --circular` reports no cycles in `src/`, so the cycle is likely either (a) introduced by Vite's chunking of mixed eager+lazy imports of the same module, or (b) a top-level use-before-declare inside a single file. Either way, the only reliable way to find it is to bisect by layer, exactly as requested.

## Approach

I will keep the current `src/App.tsx` untouched on disk by moving it aside (`App.full.tsx`) and swapping in a stub `App.tsx` for each step. After each step I will run the production build (`vite build`) — the failure only reproduces in the minified bundle — load `dist/` in the preview, and confirm whether the blank screen returns.

## Steps

1. **Baseline boot**
   - Rename `src/App.tsx` → `src/App.full.tsx`.
   - New `src/App.tsx`: `export default () => <div>App boots</div>`.
   - Build + preview. Must show "App boots".

2. **Add providers, no router** — QueryClient, Tooltip, Theme, Auth, Organization, OutboundCall. Build + preview.

3. **Add `BrowserRouter` + a single dummy route** to `<div>routed</div>`. Build + preview.

4. **Add eager-imported pages only** (SignUp, SignIn, ConfirmEmail, AcceptInvitation, LandingPage, Onboarding, Dashboard, ReportsPage, DocsIndex, DocsModule) wired to real routes. Build + preview.

5. **Add `Layout` + `Dashboard`'s real subtree** (the route the user is currently on). Build + preview. This is the most likely failure point given the current route is `/dashboard`.

6. **Add lazy CRM pages** in groups of ~5 (contacts → opportunities → tasks → messages → marketing → settings group → whatsapp → admin). Build + preview after each group.

7. **Add `GlobalCallHandler`** (lazy Twilio handlers). Build + preview.

When a step turns the screen blank, bisect that step's imports in halves until a single file is identified.

## Root-cause fix patterns I will apply once the file is identified

- **Eager + lazy import of the same module** (e.g. a settings component imported both at top and via `lazy(() => import(...))` elsewhere) — pick one strategy per module. This is the most common cause of `Cannot access 'X' before initialization` in Vite bundles and is my top hypothesis given how many `lazy(() => import("./components/settings/..."))` are mixed with regular components from the same folders.
- **Barrel re-export cycles** (`src/components/common/index.ts`, etc.) — replace barrel imports with direct file imports on the offending path.
- **Top-level use-before-declare** — hoist constants/types to dependency-free files.
- **Context consumed before created** — ensure `createContext` runs in a module with no transitive import back to its consumers.
- **Routes/arrays referencing components declared later** — reorder declarations.

## Deliverables I will report back

- Exact file (and import) that triggers the TDZ.
- The import chain that produces the cycle (printed from `madge --circular` re-run after I tag the suspect, or from manual trace).
- The source-code refactor applied.
- Screenshot/confirmation of `/dashboard` rendering without blank screen.

## Notes / constraints

- I will not touch `dist/` or any built artifact.
- I will not change behavior — only move imports / split files.
- Each bisection step is a single small commit-sized change so it's easy to revert if I'm wrong.
- Estimated 8–15 build cycles. Each Vite build on this project is ~30–60s, so the whole bisection should complete in a single working session.

Approve and I'll start at step 1.
