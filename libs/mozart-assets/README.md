# `@mozart/assets`

Raw static assets shared across Mozart apps — logos, icons, fonts, author
portraits, OG images, illustrations, screenshots.

**This lib is for raw assets only.** No Angular components, no `.ts`/`.css`
modules. UI wrappers (e.g. `<mz-logo>`) belong in `libs/mozart-ui`.

## Folder conventions

```
src/
  shared/        # used by 2+ apps (desktop, web, landing, sandbox)
    logos/       # mozart-logo.svg, mozart-symbol.svg, mozart-wordmark.svg, mozart-logo-animated.svg
    authors/     # author portraits (timothy.png, …)
    social/      # generic OG / social cards
    favicons/    # favicon variants
    fonts/       # variable webfonts (Geist*)

  landing/       # used ONLY by apps/landing
    logos/
    icons/
    illustrations/
    screenshots/
    social/      # marketing OG cards
    authors/

  desktop/       # used ONLY by apps/desktop (Angular frontend in Tauri)
    sounds/      # notification chimes (message-done.ogg, …)
    icons/tools/ # IDE / file-manager brand icons (vscode.svg, cursor.svg, …)
    app-icons/   # Tauri OS bundle icons (icon.ico, icon.icns, 32x32.png, …)
                 # referenced from apps/desktop-tauri/tauri.conf.json,
                 # NOT served to the web bundle
```

When in doubt, put it in the app-specific folder (`landing/`, `desktop/`).
Promote to `shared/` the first time a second app needs it.

## Naming

- lowercase, kebab-case, descriptive — `mozart-logo-animated.svg`, not
  `MozartLogoAnimated.svg` or `logo2.svg`
- no spaces, no random export names, no version suffixes

## How assets are served

Each app's build copies `libs/mozart-assets/src/**` into its output under
`/assets/`. So:

- `libs/mozart-assets/src/shared/logos/mozart-logo.svg`
  → `/assets/shared/logos/mozart-logo.svg`
- `libs/mozart-assets/src/landing/social/og-default.png`
  → `/assets/landing/social/og-default.png`
- `libs/mozart-assets/src/desktop/sounds/message-done.ogg`
  → `/assets/desktop/sounds/message-done.ogg`

Angular apps (`desktop`, `web`, `sandbox`) wire this through the `assets`
array in `project.json`. The Vite-based `landing` app wires it through a
small plugin in `apps/landing/vite.config.ts`.

`desktop/app-icons/` is the exception: Tauri reads those files directly
from disk at bundle time, via relative paths in
`apps/desktop-tauri/tauri.conf.json`. They are never served over HTTP.

## UI wrappers

If you need a component (e.g. `<mz-logo variant="animated" />`), it lives in
`libs/mozart-ui` and imports the asset URL from a path-based string — this
lib stays component-free.

## Future

Hot/large assets (screenshots, marketing OG, illustrations) may later move
to Cloudflare R2 / a CDN; that swap should only touch the build config and
the URL helper, not the call sites.
