# Draft content

Markdown kept out of the published site on purpose. Files here live outside
`src/content/`, so Analog never bundles them — they don't appear in the docs nav,
aren't prerendered, and have no route. They're parked here until the underlying
feature is well-defined enough to document.

To publish a draft, move it back under `src/content/docs/<group>/` and drop the
matching group from `COMING_SOON_GROUPS` in `src/app/content/docs.ts`.
