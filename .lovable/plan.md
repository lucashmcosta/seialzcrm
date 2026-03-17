

## iOS Safe Area + PWA Native Feel

### Changes

#### 1. `index.html` — viewport meta tag
Update line 5 to add `viewport-fit=cover`, `maximum-scale=1.0`, `user-scalable=no`.

#### 2. `src/index.css` — global CSS for safe areas and native feel
Add at the top (after tailwind imports):
- CSS variables for `env(safe-area-inset-*)` 
- `overscroll-behavior: none` on html/body
- `-webkit-tap-highlight-color: transparent` on all elements
- `-webkit-user-select: none` on buttons/nav
- `position: fixed; width/height: 100%; overflow: hidden` on html/body, with `#root` as the scroll container

#### 3. `src/components/mobile/MobileLayout.tsx` — safe area padding
- **Header**: add `pt-[env(safe-area-inset-top)]` style for status bar area
- **Bottom tab bar** (`<nav>` at line 113): add `pb-[env(safe-area-inset-bottom)]` via inline style
- **Drawer** (`<aside>`): add safe area bottom padding to the sign-out section

#### 4. `src/components/mobile/MobileMessagesList.tsx` — chat input safe area
Find the chat input container at the bottom of the chat view and add `paddingBottom: env(safe-area-inset-bottom, 0px)` inline style so the input isn't clipped by the home indicator.

### Files affected
- `index.html`
- `src/index.css`
- `src/components/mobile/MobileLayout.tsx`
- `src/components/mobile/MobileMessagesList.tsx`

