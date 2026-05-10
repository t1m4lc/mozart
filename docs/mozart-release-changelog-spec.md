# Specification — Mozart Release, Versioning & Public Changelog

## 1. Goal

Define a simple, reliable release system for Mozart that supports:

- one monorepo with a single root `package.json`;
- a Tauri desktop app with Rust/Cargo version metadata;
- GitHub Releases connected to desktop builds;
- conventional commits as the source of technical changelog data;
- a curated public changelog/blog that can include marketing copy, demos, videos, images, and selected commits;
- SemVer-compatible version bumps, including explicit handling of breaking changes.

This specification is designed for the current stage of Mozart. The cloud app exists only for login/profile pages at the beginning and does not need independent releases yet.

---

## 2. Product release scope

### 2.1 Current releaseable product

Only the desktop app is releaseable at the beginning.

```txt
Releaseable now:
- Mozart Desktop

Not releaseable yet:
- Cloud app
- Landing app
```

### 2.2 Cloud app

The cloud app should not have its own release workflow at the beginning because it only contains foundational account features such as:

- login;
- profile page;
- future account/billing surface.

It can be deployed continuously without SemVer product releases.

Cloud releases can be introduced later when the cloud app has user-facing product features such as:

- shared workspaces;
- team coordination;
- hosted memory;
- account-based sync;
- billing plans;
- usage dashboard;
- collaboration features.

### 2.3 Landing app

The landing app should not have SemVer releases. It is a marketing/documentation surface deployed continuously.

However, the landing app may consume release data to render:

- public changelog pages;
- release blog posts;
- demo/video sections;
- download links;
- product update announcements.

---

## 3. Versioning model

### 3.1 Single package root

Mozart currently has one `package.json` at the monorepo root.

There is no `apps/desktop/package.json`.

Therefore, the root `package.json` version is used as the source version for the desktop product for now.

```txt
Source version:
- package.json

Synced target versions:
- apps/desktop/src-tauri/tauri.conf.json
- apps/desktop/src-tauri/Cargo.toml
- Cargo.lock if necessary
```

### 3.2 Root package version meaning

Because there is only one package, the root `package.json` version represents the current Mozart Desktop release version.

This is acceptable at the current stage because desktop is the only releaseable product.

If Mozart later has multiple independently releaseable products, the versioning model should be revisited.

### 3.3 Version files

The following files must stay synchronized for desktop releases:

```txt
package.json
apps/desktop/src-tauri/tauri.conf.json
apps/desktop/src-tauri/Cargo.toml
```

Optional or generated files:

```txt
pnpm-lock.yaml
Cargo.lock
```

The release workflow should ensure all required version files are updated in the release PR.

---

## 4. Tagging strategy

### 4.1 Recommended tag format

Use desktop-prefixed tags even though the root package is the source of version truth.

```txt
desktop-v0.1.0
desktop-v0.1.1
desktop-v0.2.0
desktop-v1.0.0
```

Reason:

- avoids ambiguity when cloud releases are added later;
- keeps GitHub Releases product-specific;
- makes it clear that binaries attached to the release are desktop binaries.

### 4.2 Avoid global `vX.Y.Z` tags for now

Avoid this at the beginning:

```txt
v0.1.0
```

It is ambiguous in a monorepo because it does not say whether the release concerns desktop, cloud, landing, CLI, or future packages.

---

## 5. SemVer rules

Mozart should follow SemVer for the desktop app.

```txt
MAJOR.MINOR.PATCH
```

### 5.1 Patch release

Use a patch bump for user-facing fixes that do not add meaningful new behavior and do not break compatibility.

Examples:

```txt
0.1.0 -> 0.1.1
```

Commit examples:

```txt
fix(desktop): prevent crash when opening invalid repository
fix(desktop): fix broken sidebar resizing
fix(desktop): restore missing workspace icon
```

### 5.2 Minor release

Use a minor bump for backward-compatible user-facing features or meaningful improvements.

Examples:

```txt
0.1.1 -> 0.2.0
```

Commit examples:

```txt
feat(desktop): add workspace switcher
feat(desktop): add first-run onboarding
feat(desktop): add repository import flow
```

### 5.3 Major release

Use a major bump for breaking changes after the product reaches `1.0.0`.

Examples:

```txt
1.4.2 -> 2.0.0
```

Before `1.0.0`, breaking changes may bump the minor version by convention:

```txt
0.2.3 -> 0.3.0
```

However, because desktop apps are installed by real users, significant breaking changes before `1.0.0` should still be highlighted clearly in the public release notes.

---

## 6. Breaking changes

### 6.1 What counts as a breaking change for Mozart Desktop

A breaking change is any change that can disrupt existing users, data, workflows, or integrations.

For Mozart Desktop, breaking changes include:

- local database schema reset;
- incompatible workspace/project format change;
- removal of a previously available feature;
- major settings/config format change;
- changed location of local app data;
- changed authentication/session behavior that forces logout;
- changed provider/model configuration format;
- changed command execution behavior that invalidates existing workflows;
- dropped OS support;
- dropped architecture support, for example removing Linux x64 or macOS Intel support;
- migration that cannot be rolled back;
- migration that may require user action.

### 6.2 What does not count as breaking

These are usually not breaking changes:

- internal refactor;
- dependency update with no user-facing impact;
- UI copy change;
- bug fix that restores intended behavior;
- new optional feature;
- performance improvement;
- visual polish;
- adding support for a new OS without removing existing support.

### 6.3 How to mark breaking changes in commits

Use Conventional Commits breaking syntax.

Option A — exclamation mark:

```txt
feat(desktop)!: change workspace metadata format
```

Option B — footer:

```txt
feat(desktop): change workspace metadata format

BREAKING CHANGE: Existing workspace metadata will be migrated to the new format. Older Mozart versions cannot reopen migrated workspaces.
```

Both should be treated as breaking.

### 6.4 Breaking change checklist before release

Before merging a release PR, check:

```txt
[ ] Does this release change local database schema?
[ ] Does this release change workspace/project file format?
[ ] Does this release remove a feature?
[ ] Does this release drop OS or architecture support?
[ ] Does this release force logout or reset settings?
[ ] Does this release require manual user action?
[ ] Does this release make rollback impossible or risky?
```

If any answer is yes, the release must include a `Breaking changes` section.

### 6.5 SemVer decision table

```txt
Only fixes, no breaking change
=> PATCH

At least one user-facing feature, no breaking change
=> MINOR

Breaking change after 1.0.0
=> MAJOR

Breaking change before 1.0.0
=> MINOR, but public changelog must clearly flag it
```

---

## 7. Conventional commit policy

### 7.1 Commit format

Mozart should use a stricter Conventional Commit format that supports:

- type;
- scope;
- optional ticket/reference;
- short message;
- optional body description;
- optional footers.

Recommended format:

```txt
type(scope)[ticket]: short message

Optional longer description.

Optional footers.
```

Examples:

```txt
feat(desktop)[MOZ-124]: add workspace switcher
fix(desktop)[MOZ-130]: prevent crash when opening invalid repository
perf(desktop)[MOZ-141]: speed up project indexing
docs(specs)[MOZ-155]: document release workflow
chore(infra)[MOZ-160]: update github actions cache
```

The `[ticket]` part is recommended but can be optional for very small commits.

### 7.2 Why use `[ticket]` in the header

The ticket should be in the commit header because it makes commits easier to scan, link, and group later.

This is better than hiding the ticket only in the body because the release selection script can quickly connect commits to the internal backlog.

The format should not use GitHub issue syntax directly in the main subject unless the project has public GitHub issues.

Recommended:

```txt
feat(desktop)[MOZ-124]: add workspace switcher
```

Avoid at the beginning:

```txt
feat(desktop): add workspace switcher (#124)
```

Reason: `#124` assumes GitHub Issues or PR numbers are the main source of truth. Mozart may later use an internal backlog, GitHub Projects, Linear, Notion, or its own Mozart task IDs.

### 7.3 Ticket naming strategy

Use a stable internal prefix:

```txt
MOZ-1
MOZ-2
MOZ-124
```

The ticket can later map to:

- GitHub Issue;
- GitHub PR;
- Linear issue;
- Notion task;
- internal Mozart backlog item;
- AI-generated implementation task.

A release script can later enrich a commit by resolving `MOZ-124` to a URL.

### 7.4 Scope strategy

The scope should describe the impacted product surface or technical area.

Primary product scopes:

```txt
desktop
cloud
landing
all
```

Technical scopes:

```txt
infra
release
specs
docs
ui
data
agent
```

Rules:

```txt
Use desktop when the change impacts the desktop app.
Use cloud when the change impacts the cloud app.
Use landing when the change impacts the marketing/docs/changelog site.
Use all when the change intentionally affects every app or the global product.
Use infra/release/specs/docs for non-product implementation work.
```

Avoid empty scopes for normal work.

Allowed no-scope commits should be rare and limited to repository-level maintenance, for example:

```txt
chore: initialize repository
```

### 7.5 Required commit scopes

Use scopes to distinguish product surfaces.

```txt
desktop
cloud
landing
all
docs
specs
release
infra
```

Examples:

```txt
feat(desktop)[MOZ-124]: add workspace switcher
fix(desktop)[MOZ-130]: prevent crash when opening invalid repository
feat(cloud)[MOZ-210]: add profile page
fix(landing)[MOZ-220]: improve mobile hero layout
docs(specs)[MOZ-230]: update release strategy
chore(infra)[MOZ-240]: update github actions
```

### 7.6 Commit types

Allowed types:

```txt
feat
fix
perf
refactor
docs
style
test
build
ci
chore
revert
```

Release-impacting types by default:

```txt
feat => minor
fix => patch
perf => patch, unless it introduces a feature-level user benefit
```

Non-release-impacting types by default:

```txt
refactor
docs
style
test
build
ci
chore
```

### 7.7 Commits that affect public changelog by default

By default, only these types should be considered for the user-facing changelog:

```txt
feat(desktop)
fix(desktop)
perf(desktop)
feat(all)
fix(all)
perf(all)
```

Optional later:

```txt
feat(cloud)
fix(cloud)
perf(cloud)
```

### 7.8 Commits excluded from public changelog by default

Exclude these from public changelog by default:

```txt
chore
ci
build
test
refactor
docs
style
```

They may still appear in the technical changelog if useful.

### 7.9 User-facing override

A commit can explicitly declare that it should appear in the public changelog:

```txt
fix(desktop)[MOZ-130]: improve failed command error message

User-facing: true
```

A commit can explicitly declare that it should not appear:

```txt
feat(desktop)[MOZ-131]: add internal debug panel

Public-changelog: false
```

This is useful because not all `feat` commits are meaningful for users, and some `fix` commits are too minor for a marketing changelog.

### 7.10 Breaking changes in commits

Breaking changes must be marked using Conventional Commit syntax.

Option A:

```txt
feat(desktop)![MOZ-300]: change workspace metadata format
```

Option B:

```txt
feat(desktop)[MOZ-300]: change workspace metadata format

BREAKING CHANGE: Existing workspace metadata will be migrated to the new format. Older Mozart versions cannot reopen migrated workspaces.
```

Option B is preferred for important breaking changes because it forces a clear explanation.

### 7.11 Husky and commitlint enforcement

Mozart should use Husky + commitlint to enforce commit message format locally.

Recommended tools:

```txt
husky
@commitlint/cli
@commitlint/config-conventional
```

Recommended hooks:

```txt
.husky/commit-msg
```

The hook should run:

```txt
pnpm commitlint --edit "$1"
```

Commitlint should enforce:

```txt
allowed types
required scope for most commits
allowed scopes
subject max length
lowercase type
no trailing period in subject
optional ticket pattern [MOZ-123]
breaking change syntax support
```

### 7.12 Commit examples

Good:

```txt
feat(desktop)[MOZ-124]: add workspace switcher
fix(desktop)[MOZ-130]: prevent crash when opening invalid repository
perf(desktop)[MOZ-141]: speed up project indexing
feat(all)[MOZ-150]: add shared design tokens
chore(infra)[MOZ-160]: update github actions cache
docs(specs)[MOZ-170]: document release workflow
```

Good breaking change:

```txt
feat(desktop)[MOZ-300]: migrate workspace metadata

BREAKING CHANGE: Older Mozart versions cannot reopen migrated workspaces.
```

Avoid:

```txt
update stuff
fix bug
feat: add thing
feat(app): stuff
fix(desktop): bug
```

Reason:

- missing type/scope/ticket clarity;
- vague message;
- weak traceability to backlog;
- harder to generate useful release notes.

---

## 8. Release workflow

### 8.1 Overview

The release workflow should be:

```txt
1. Developers merge conventional commits into main.
2. release-please opens or updates a release PR.
3. The release PR bumps the root package version.
4. A sync script updates Tauri and Cargo versions.
5. The release PR updates the technical changelog.
6. A draft public changelog entry is generated.
7. A human edits/selects what should be public.
8. The release PR is merged.
9. GitHub tag is created.
10. GitHub Release is created.
11. Tauri builds desktop artifacts for supported OSes.
12. The landing app can render the curated changelog post.
```

### 8.2 Release PR must include

A release PR should include:

```txt
package.json version bump
apps/desktop/src-tauri/tauri.conf.json version bump
apps/desktop/src-tauri/Cargo.toml version bump
technical CHANGELOG.md update
curated public changelog draft or update
```

### 8.3 Human review before publishing

Before merging the release PR, a human must review:

```txt
[ ] Is the SemVer bump correct?
[ ] Are breaking changes correctly marked?
[ ] Are only relevant user-facing commits selected for the public changelog?
[ ] Is marketing copy accurate and not exaggerated?
[ ] Are screenshots/videos/demo links correct?
[ ] Are supported platforms listed correctly?
[ ] Are download links or release artifact assumptions correct?
```

---

## 9. Public changelog/blog model

### 9.1 Inspiration: Conductor-style changelog

Mozart should use a changelog style inspired by Conductor.

The Conductor changelog has two important properties:

- `/changelog` is an index page that lists releases with their visible content, not only a list of links;
- each release also has a dedicated page with version, date, title, narrative sections, images/videos, and grouped lists such as Improvements, Fixes, and Misc.

For Mozart, this means the changelog system should generate both:

```txt
apps/landing/content/changelog/desktop-v0.1.0.mdx
apps/landing/content/changelog/index-data.generated.json
```

The index page should be able to render all public changelog entries in reverse chronological order.

### 9.2 Purpose

The public changelog is not only a technical changelog.

It should be a product update page that can include:

- selected visible features;
- selected visible fixes;
- demo videos;
- screenshots;
- GIFs;
- marketing explanation;
- migration notes;
- platform availability;
- download links;
- known limitations.

### 9.3 Public changelog should be curated

The public changelog must not blindly include every commit.

Instead, the release workflow should generate a draft from conventional commits, then allow manual selection and editing.

The public changelog should answer:

```txt
What changed for the user?
Why does it matter?
How can the user try it?
Is there anything they need to know before updating?
```

### 9.4 Public changelog content location

Recommended location:

```txt
apps/landing/content/changelog/desktop-v0.1.0.mdx
```

Alternative location if the landing app is not ready:

```txt
docs/changelog/public/desktop-v0.1.0.mdx
```

The content can later be moved or consumed by the landing app.

### 9.5 Public changelog frontmatter

Each public changelog entry should use frontmatter.

```mdx
---
title: 'Mozart Desktop v0.1.0'
slug: 'desktop-v0.1.0-first-local-workspaces'
version: '0.1.0'
tag: 'desktop-v0.1.0'
product: 'desktop'
date: '2026-05-10'
platforms:
  - macOS
  - Linux
releaseType: 'minor'
breaking: false
heroImage: '/images/changelog/desktop-v0.1.0/hero.png'
demoVideo: 'https://example.com/demo.mp4'
githubRelease: 'https://github.com/t1m4lc/mozart/releases/tag/desktop-v0.1.0'
---
```

### 9.6 Public changelog body template

```mdx
# Mozart Desktop v0.1.0

A short marketing-oriented intro explaining the release in plain language.

## Highlights

- Added workspace switcher to move faster between projects.
- Improved first-run experience for new users.
- Fixed repository opening crashes.

## Demo

<Video src="https://example.com/demo.mp4" />

## New

### Workspace switcher

Explain the feature in user language. Add screenshot or GIF if useful.

<Image src="/images/changelog/desktop-v0.1.0/workspace-switcher.png" alt="Workspace switcher" />

## Improvements

- Faster startup.
- Better empty states.

## Fixes

- Fixed a crash when opening an invalid repository.
- Fixed sidebar resizing on small screens.

## Misc

- Internal polish worth mentioning publicly.

## Breaking changes

No breaking changes in this release.

## Availability

Mozart Desktop v0.1.0 is available for:

- macOS
- Linux
- Windows, if supported by the release workflow

## Full technical changelog

See the GitHub Release for the full technical changelog.
```

### 9.7 Changelog index page behavior

The landing changelog index should behave like a full feed.

It should render:

```txt
/changelog
```

With all releases in reverse chronological order.

Each release entry should show:

```txt
version
date
title
short summary
hero media if configured
selected feature/improvement/fix sections
link to dedicated release page
```

Each dedicated release page should render:

```txt
/changelog/desktop-v0.1.0-first-local-workspaces
```

The index page may show the full content or a shortened version depending on the design.

### 9.8 Changelog section naming

Use user-facing section names similar to Conductor:

```txt
Highlights
New
Improvements
Fixes
Misc
Breaking changes
Availability
```

Avoid exposing raw commit categories directly on the public page.

---

## 10. Changelog selection model

### 10.1 Why selection is needed

The public changelog should be editorial.

Not every commit should appear. Some fixes are too small. Some features are internal. Some technical changes matter only to contributors.

Therefore, generated changelog data should be treated as a draft, not final content.

### 10.2 Selection file

For each release, generate a selection file first.

Recommended location:

```txt
docs/release-notes/desktop-v0.1.0.selection.yml
```

Example:

```yaml
version: 0.1.0
tag: desktop-v0.1.0
product: desktop
releaseType: minor
breaking: false

commits:
  - hash: abc1234
    type: feat
    scope: desktop
    title: add workspace switcher
    selected: true
    section: New
    publicTitle: Add workspace switcher
    publicDescription: Move between projects faster without losing context.

  - hash: def5678
    type: fix
    scope: desktop
    title: prevent crash when opening invalid repository
    selected: true
    section: Fixed
    publicTitle: Fixed invalid repository crash
    publicDescription: Mozart now handles invalid folders more safely.

  - hash: ghi9012
    type: chore
    scope: infra
    title: update rust cache in ci
    selected: false
```

### 10.3 MDX generation from selection file

A script should generate the public MDX from the selection file.

Recommended command:

```txt
pnpm release:changelog:public desktop-v0.1.0
```

Input:

```txt
docs/release-notes/desktop-v0.1.0.selection.yml
```

Output:

```txt
apps/landing/content/changelog/desktop-v0.1.0.mdx
```

### 10.4 Marketing fields

The selection file should allow optional marketing fields:

```yaml
marketing:
  headline: 'A smoother way to start working with agents'
  summary: 'This release improves the first desktop workflow for local projects.'
  heroImage: '/images/changelog/desktop-v0.1.0/hero.png'
  demoVideo: 'https://example.com/demo.mp4'
  ctaLabel: 'Download Mozart Desktop'
  ctaHref: 'https://github.com/t1m4lc/mozart/releases/tag/desktop-v0.1.0'
```

This allows a release to become a blog post, not just a commit list.

---

## 11. Technical changelog vs public changelog

### 11.1 Technical changelog

The technical changelog is generated automatically from commits.

Recommended location:

```txt
CHANGELOG.md
```

It is useful for:

- developers;
- release review;
- GitHub Release body;
- traceability.

### 11.2 Public changelog

The public changelog is curated and marketing-aware.

Recommended location:

```txt
apps/landing/content/changelog/*.mdx
```

It is useful for:

- users;
- website updates;
- launch communication;
- demos;
- product storytelling.

### 11.3 Rule

Do not use the technical changelog directly as the public blog post.

Use it as input, then curate.

---

## 12. Release automation scripts

### 12.1 Sync desktop version script

Required script:

```txt
tools/release/sync-desktop-version.ts
```

Purpose:

```txt
Read version from root package.json.
Write same version to Tauri config and Cargo.toml.
```

Command:

```txt
pnpm release:sync-desktop-version
```

### 12.2 Generate release selection draft

Required script:

```txt
tools/release/generate-release-selection.ts
```

Purpose:

```txt
Read commits since previous desktop tag.
Parse conventional commits.
Detect feat/fix/perf/breaking changes.
Generate a YAML selection draft.
```

Command:

```txt
pnpm release:selection desktop-v0.1.0
```

### 12.3 Generate public changelog MDX

Required script:

```txt
tools/release/generate-public-changelog.ts
```

Purpose:

```txt
Read selection YAML.
Generate curated MDX public changelog.
```

Command:

```txt
pnpm release:changelog:public desktop-v0.1.0
```

---

## 13. GitHub Release body

GitHub Release body can be more technical than the website changelog but still readable.

Recommended sections:

```md
## Highlights

- Short list of selected changes.

## New

- Feature list.

## Fixed

- Fix list.

## Breaking changes

- Required migration or compatibility notes.

## Downloads

Desktop installers are attached below.

## Full changelog

Generated from commits.
```

The GitHub Release should link to the public changelog page once the landing app supports it.

---

## 14. Platform support in releases

Each desktop release must explicitly list supported platforms.

Example:

```yaml
platforms:
  - macOS
  - Linux
```

Do not claim Windows support until Windows builds are actually produced and tested.

If one platform is missing for a release, the public changelog must say so clearly.

Example:

```md
Windows builds are not available in this release yet.
```

Dropping a previously supported platform is a breaking change.

---

## 15. Initial implementation plan

### Step 1 — Add version sync

Add:

```txt
tools/release/sync-desktop-version.ts
```

Update root `package.json` scripts:

```json
{
  "scripts": {
    "release:sync-desktop-version": "tsx tools/release/sync-desktop-version.ts"
  }
}
```

### Step 2 — Add release-please

Add:

```txt
release-please-config.json
.release-please-manifest.json
.github/workflows/release-please.yml
```

Configure release-please to:

- read the root package version;
- use `desktop` as component/tag prefix;
- generate `desktop-vX.Y.Z` tags;
- update `CHANGELOG.md`.

### Step 3 — Add desktop build workflow

Add:

```txt
.github/workflows/desktop-release.yml
```

Triggered by:

```txt
desktop-v*
```

Build and attach Tauri artifacts to the GitHub Release.

### Step 4 — Add public changelog draft system

Add:

```txt
tools/release/generate-release-selection.ts
tools/release/generate-public-changelog.ts
docs/release-notes/*.selection.yml
```

Later, when landing content exists, output MDX to:

```txt
apps/landing/content/changelog/*.mdx
```

---

## 16. Acceptance criteria

The implementation is accepted when:

```txt
[ ] Root package.json is the source of the desktop version.
[ ] Tauri config version is synced from root package.json.
[ ] Cargo.toml version is synced from root package.json.
[ ] Desktop releases use tags like desktop-v0.1.0.
[ ] GitHub Releases are generated from release workflow.
[ ] Desktop artifacts are attached to GitHub Releases.
[ ] Technical changelog is generated from conventional commits.
[ ] Public changelog is curated, not blindly generated.
[ ] A selection file allows choosing commits for public changelog.
[ ] Public changelog supports marketing copy, screenshots, videos, demos, and CTA links.
[ ] Breaking changes are detected from Conventional Commit syntax.
[ ] Breaking changes are manually reviewed before release.
[ ] SemVer bump follows fix/feat/breaking rules.
[ ] Cloud app has no independent release process yet.
[ ] Landing app has no SemVer release process.
```

---

## 17. Final decision summary

Mozart should start with a simple desktop-first release model.

```txt
One monorepo.
One root package.json.
Root version = current desktop product version.
Desktop releases only at the beginning.
Cloud app deployed continuously, no release needed yet.
Landing app deployed continuously, no SemVer release.
Desktop tags use desktop-vX.Y.Z.
Tauri and Cargo versions are synced from root package.json.
Technical changelog is generated automatically.
Public changelog is curated through a selection file.
Breaking changes are detected through Conventional Commits and manually reviewed.
SemVer bump is PATCH for fixes, MINOR for features, MAJOR for breaking changes after 1.0.0.
Before 1.0.0, breaking changes bump MINOR but must be clearly highlighted.
```
