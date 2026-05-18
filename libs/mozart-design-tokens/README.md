# mozart-design-tokens

Central design tokens for Mozart UI: Tailwind v4 `@theme` tokens, Spartan UI theme
variables, font declarations, brand colors, and global shared theme styles.

Consumed by all apps (`apps/desktop`, `apps/web`, `apps/landing`, `apps/sandbox`)
via `@import "../../../libs/mozart-design-tokens/src/index.css"` in their
`styles.css`.

## Structure

- `src/index.css` — entry point, imports base + theme variants
- `src/lib/base.css` — `@font-face`, `@theme inline`, `@layer base`
- `src/lib/themes/zinc.css` — neutral slate surface, violet brand accent
- `src/lib/themes/stone.css` — warm stone surface, amber brand accent
