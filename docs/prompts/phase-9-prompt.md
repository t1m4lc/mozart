# Mozart — Phase 9 prompt (incremental)

## Production readiness via sub-phases

## Goal

Mozart ships to users in **progressive steps**, not in a
single big-bang production launch.

Each sub-phase is **independently shippable** : at the end
of any sub-phase, you have a working, distributable
product. The next sub-phase adds polish, scale, or
distribution surface — but you don't need it to start using
real beta testers.

**Why incremental** :

- Beta tester audience (indie devs, technical users) doesn't
  need signing / notarization to install unsigned apps. They
  know how to bypass Gatekeeper / SmartScreen.
- Apple Developer Program (~99 USD/year) and Windows
  Authenticode certificate (~200-400 USD/year) are real
  costs better deferred until you have real distribution
  pressure.
- Telemetry, crash reports, auto-update need actual users
  to validate. Building them speculatively before any user
  feedback wastes time.
- Cloudflare landing + R2 distribution can ship Day 1
  without signing or telemetry. That's already a real
  product live on the web.

The sub-phases below are ordered by **what unblocks beta
testing first** vs **what you only need when you grow**.

---

## Sub-phase overview

| #       | Goal                                                                      | Required ?                           | Cost                               | Effort |
| ------- | ------------------------------------------------------------------------- | ------------------------------------ | ---------------------------------- | ------ |
| **9.1** | Distribute unsigned beta builds via CrabNebula Cloud or R2 + landing page | Yes — Day 1                          | ~€10/mo (CrabNebula) or 0 USD (R2) | High   |
| **9.2** | Crash reporting + minimal observability                                   | Yes — early beta                     | 0 USD (free tier)                  | Medium |
| **9.3** | Auto-update for unsigned builds                                           | Recommended — week 2-4               | 0 USD                              | Medium |
| **9.4** | Telemetry + product analytics                                             | When user count > 10                 | 0 USD (free tier)                  | Medium |
| **9.5** | macOS code signing + notarization                                         | When users complain about Gatekeeper | ~99 USD/year                       | High   |
| **9.6** | Windows Authenticode signing                                              | When you ship to non-dev users       | ~200-400 USD/year                  | High   |
| **9.7** | Multi-channel releases (beta vs stable)                                   | When you have paying customers       | 0 USD                              | Medium |
| **9.8** | Privacy / ToS hardening + GDPR if EU users                                | Before real public launch            | 0 USD (templated)                  | Low    |

**Sub-phases 9.1, 9.2, 9.3 = your immediate scope.** That
gets you to "indie devs can install Mozart, errors are
caught, and updates push automatically." Everything else
waits for signal from real users.

---

## Pre-requisites by sub-phase

The user (Timothy) handles these manually. The agent
confirms each before the relevant sub-phase starts.

### For 9.1 (Day 1 — beta) :

- Cloudflare account (free tier sufficient — for DNS,
  landing, web app, regardless of distribution path)
- DNS migration : Dynadot → Cloudflare nameservers for
  `mozart.build`
- `apps/landing` source ready (or willing to bootstrap it)
- **Distribution path decision** : CrabNebula Cloud
  (managed, ~€10/mo, recommended) or R2 (DIY, 0 USD, more
  setup work). See the path comparison below.
- If CrabNebula path : sign up at https://crabnebula.cloud,
  apply for OSS discount if applicable

### For 9.2 :

- Sentry account (free tier — 5k events/month is plenty for
  beta)

### For 9.3 :

- Tauri update signing keypair generated (free, just
  `tauri signer generate`)

### For 9.4 :

- PostHog account (free tier — 1M events/month) or
  equivalent

### For 9.5 (deferred, no rush) :

- Apple Developer Program enrollment (~99 USD/year)

### For 9.6 (deferred, no rush) :

- Windows Authenticode certificate (~200-400 USD/year), or
  Azure Trusted Signing per-use

### For 9.8 (before public-public launch) :

- Privacy + ToS drafts (templated via termsfeed.com or
  written by hand)

---

## Context (applies to all sub-phases)

- `docs/specs/plan.md` → Phase 9 (Goal, Scope, Deliverables)
- `docs/specs/onboarding-and-auth.md` → §4 (apps/web) + §5
  (Tauri deep links)
- `docs/audit/v0.0.1-post-mvp-audit.md` → state entering
  Phase 9
- `apps/desktop` → app to bundle and release
- `apps/web` → web app to deploy at `app.mozart.build`
  (already built in Phase 5)
- `apps/landing` → landing site at `mozart.build` (created
  in sub-phase 9.1)

---

## Method (applies to all sub-phases)

Plan mode. Each sub-phase :

1. Phase A : read what's currently in place
2. Phase B : plan the specific deliverables
3. Execute (config + scripts + manual steps interleaved)
4. Check acceptance
5. Ship

**Sub-phases are independent prompts.** Don't run them
back-to-back blindly. Use Mozart for a few days / weeks
between sub-phases to see what actually breaks or what users
ask for. Skip sub-phases you don't need yet.

---

# Sub-phase 9.1 — Minimum viable distribution

**Effort : High. Sessions : 2-3. Cost : 0 USD.**

This is the only sub-phase you **must** ship to get beta
testers. Everything below it is optional / deferred.

## Scope

- `mozart.build` serves an Analog SSG landing page
- `app.mozart.build` serves the existing Angular web app
- `downloads.mozart.build` (Cloudflare R2) hosts unsigned
  Tauri binaries for macOS, Linux, Windows
- `/download` page on the landing detects OS and points to
  the right binary
- Clear install instructions on `/download` for unsigned
  builds (how to bypass Gatekeeper on macOS, SmartScreen on
  Windows)
- Manual release process via `npm run release` (no CI yet)

## Out of scope for 9.1

- Code signing (9.5, 9.6)
- Auto-update polish (9.3 ; basic update server URL is wired
  here, the in-app update prompt + signed manifest flow lands
  in 9.3)
- Crash reporting (9.2)
- Telemetry (9.4)
- Privacy / ToS pages (9.8)
- Multi-channel polish (9.7 ; channel infrastructure is
  ready here if using Path A, the in-app channel switcher
  lands in 9.7)

---

## Distribution path : pick one before starting

Two options for the binary distribution layer. **Pick at
the start of Phase A** ; the choice changes the Blocks
below.

### Path A — CrabNebula Cloud (managed, recommended default)

CrabNebula Cloud is the official Tauri partner for app
distribution. Conductor (a similar Tauri-based dev tool)
uses it. The service provides :

- Global CDN with stable URLs
  (`cdn.crabnebula.app/download/{org}/{app}/{channel}/platform/{platform}`)
- Built-in update server (Tauri updater hits it natively)
- Multi-channel releases via a `--channel` flag (no extra
  infra needed)
- Public market page with platform-aware download buttons
- Download analytics out of the box
- GitHub Action for CI/CD releases
- CLI to draft + upload from local machine

**Pricing (2026)** : €8.85/month base, includes 1 GB
storage + 5K downloads/month. Beyond : €0.41/GB and
€1.18/10K downloads. **Open-source discount** likely
applicable to Mozart — check at signup.

**Estimated cost for Mozart in beta** : ~€10/month flat
(probably €5 if OSS discount applies).

What CrabNebula does NOT provide :

- OS-level code signing (Apple Developer ID, Windows
  Authenticode) — those still cost extra and stay in
  9.5/9.6
- Crash reporting (still need Sentry in 9.2)
- Product analytics (still need PostHog in 9.4 ; CrabNebula
  analytics cover downloads, not in-app events)

**What collapses into 9.1 with this path** : the auto-
update server (so 9.3 becomes "polish the UX of the update
prompt" instead of "stand up the update server"), the
download analytics (so 9.4's PostHog scope shrinks), the
multi-channel infra (so 9.7 becomes "wire the channel
switcher in Settings").

### Path B — DIY (Cloudflare R2 + manual scripts)

Self-hosted distribution on Cloudflare R2 with a manual
release script. Full control, no vendor lock-in, free
within R2's generous free tier (10 GB storage, 1M Class A
ops). Costs zero for Mozart's first year easily.

Trade-off : you build and maintain the release pipeline,
the `latest.json` schema, the public download page UX,
and the multi-channel infra yourself. Several hours of
setup + ongoing maintenance.

**Pick Path B if** : you anticipate very high download
volume (€1.18/10K becomes meaningful at 100K+ downloads
/month), or you have strong preferences against vendor
lock-in, or you specifically want to keep distribution on
your own infrastructure.

**Pick Path A otherwise.** For a solo-founder beta phase,
Path A is almost always the right call.

---

## Blocks (Path A — CrabNebula Cloud)

### Block A — Cloudflare account + DNS migration

User steps :

1. Add `mozart.build` to Cloudflare account
2. **In Dynadot** : change nameservers to Cloudflare's
   (Dynadot keeps the domain, Cloudflare gets DNS authority)
3. Wait propagation (1-24 h ; check with `dig NS mozart.build`)
4. Cloudflare SSL : Full (strict), Always HTTPS,
   HTTP/2 + HTTP/3, Brotli

### Block B — `apps/landing` bootstrap + deploy

1. Bootstrap Analog SSG in `apps/landing`
2. Pages for 9.1 :
   - `/` — hero + value prop + screenshot + download CTA
     pointing to CrabNebula download URLs
   - `/download` — OS detection + binary links from
     CrabNebula (stable URLs that never change across
     releases)
3. Cloudflare Pages project `mozart-landing` :
   - Build : `nx build landing`
   - Output : `dist/apps/landing/public`
   - Domain : `mozart.build`
4. `www.mozart.build` → 301 redirect to `mozart.build`
5. Cache + security headers via `_headers` file (per the
   `mise-en-prod` notes the user pasted earlier)

### Block C — `apps/web` deploy

1. Cloudflare Pages project `mozart-app` :
   - Build : `nx build web`
   - Output : `dist/apps/web/browser`
   - Domain : `app.mozart.build`
2. SPA fallback via `_redirects` : `/*    /index.html   200`
3. Test the deep-link end-to-end with a local desktop build

### Block D — CrabNebula Cloud setup (Path A)

User steps :

1. Sign up at https://crabnebula.cloud (GitHub or GitLab
   account)
2. Create an organization (e.g. `mozart` or your name)
3. Create an application :
   - **Name** : `Mozart`
   - **Slug** : `mozart` (this becomes part of the public
     URLs)
   - **Visibility** : `Public` (creates the market page) or
     `Private` (only known URL works) — recommended
     `Private` during early beta, switch to `Public` for
     general availability
   - **Application type** : `Tauri (v2)`
4. If Mozart is or becomes open-source : apply for the
   OSS subsidy at signup
5. Install the CrabNebula CLI :
   `curl -sSf https://cdn.crabnebula.app/cli/install.sh | sh`
   (or follow the docs for your OS)
6. Authenticate the CLI : `cn login`

The application URLs once set up :

```
Public market page (if Public visibility) :
  https://web.crabnebula.cloud/{org-slug}/mozart

Direct download URLs (stable across releases) :
  https://cdn.crabnebula.app/download/{org-slug}/mozart/latest/platform/dmg-aarch64
  https://cdn.crabnebula.app/download/{org-slug}/mozart/latest/platform/dmg-x86_64
  https://cdn.crabnebula.app/download/{org-slug}/mozart/latest/platform/appimage-x86_64
  https://cdn.crabnebula.app/download/{org-slug}/mozart/latest/platform/nsis-x86_64

Update server endpoint for tauri-plugin-updater :
  https://cdn.crabnebula.app/update/{org-slug}/mozart/{target}/{current_version}
```

These URLs go into the landing's `/download` page links
(stable forever) and into `tauri.conf.json`'s updater
endpoint.

### Block E — Release pipeline (Path A)

Two options, pick one :

**E1 — Local CLI release (simplest for 9.1)** :

`scripts/release.sh` :

```bash
#!/bin/bash
set -e

VERSION=$(node -p "require('./package.json').version")
echo "Releasing v${VERSION}..."

# Build for current OS
npm run tauri:build

# Upload to CrabNebula Cloud
cn release draft mozart --channel beta --version ${VERSION}
cn release upload mozart --channel beta --bundle "src-tauri/target/release/bundle/**"
cn release publish mozart --channel beta

echo "Released v${VERSION} on the beta channel"
echo "Download : https://cdn.crabnebula.app/download/{org-slug}/mozart/beta/platform/{platform}"
```

Run on macOS + Linux + Windows machines manually for the
first releases. The CLI handles bundling, hashing,
signing the update manifest, uploading.

**E2 — GitHub Actions release (CI, defer to 9.3 or later)** :

CrabNebula provides
[crabnebula-dev/cloud-release](https://github.com/crabnebula-dev/cloud-release)
GitHub Action. Set up the workflow when local CLI gets
tedious (typically after 5-10 manual releases).

For 9.1, ship with E1 (local CLI). E2 lands in 9.3 along
with auto-update polish.

### Block F — `/download` page polish

The page must clearly explain how to install unsigned
binaries (this stays the same regardless of Path A or B —
unsigned is unsigned).

```markdown
## macOS — unsigned beta install

The Mozart beta is unsigned while we're in private testing.
To install :

1. Download the .dmg
2. Open it, drag Mozart to Applications
3. Right-click Mozart in Applications → Open
4. Click "Open" in the warning dialog

You only need to do this once. Future launches work normally.

## Windows — unsigned beta install

1. Download the .exe
2. Run it
3. SmartScreen will warn — click "More info" → "Run anyway"

## Linux

1. Download the .AppImage
2. `chmod +x mozart_*.AppImage`
3. Run it
```

Download buttons point to the **stable CrabNebula URLs**
from Block D (Path A) or the R2 versioned URLs (Path B).
With Path A, the URLs never change across releases — perfect
for marketing copy.

A small `Beta` badge in the landing's hero makes the
expectation clear.

---

## Blocks (Path B — DIY R2) — alternative

Only follow this section instead of Block D/E if you
explicitly chose Path B at the start. Blocks A, B, C, F
stay the same.

### Block D' — R2 bucket + `downloads.mozart.build`

1. Create R2 bucket `mozart-releases`
2. Custom domain : `downloads.mozart.build` → bucket
3. Structure :

   ```
   downloads.mozart.build/
   ├── v0.1.0-beta.1/
   │   ├── Mozart_0.1.0-beta.1_x64.dmg
   │   ├── Mozart_0.1.0-beta.1_aarch64.dmg
   │   ├── mozart_0.1.0-beta.1_amd64.AppImage
   │   ├── Mozart_0.1.0-beta.1_x64-setup.exe
   │   └── SHA256SUMS.txt
   ```

4. Cache headers : versioned paths immutable, `latest.json`
   (added in 9.3) short cache

### Block E' — Manual release script

`scripts/release.sh` :

1. Build Tauri for current OS via `npm run tauri:build`
2. Generate `SHA256SUMS.txt`
3. Upload to R2 via Wrangler CLI :
   `wrangler r2 object put mozart-releases/v0.1.0-beta.1/...`
4. Print the install URL

User runs this manually on macOS + Linux + Windows machines.
No code signing yet. The auto-update server (latest.json
generation + signing) lands in 9.3.

---

## Acceptance for 9.1

Common :

- `mozart.build` serves landing
- `app.mozart.build` serves web app, auth flow works
- `/download` page renders, OS detection works, install
  instructions for unsigned binaries clear
- A beta tester can : visit `mozart.build` → `/download` →
  download right binary → bypass OS warning → install →
  launch → sign in → onboard → use Mozart

Path A specific :

- CrabNebula Cloud organization + application created
- First release uploaded via `cn release` CLI
- Stable download URLs work
  (`cdn.crabnebula.app/download/{org}/mozart/...`)
- Public market page accessible (if Visibility set to
  Public) or known-URL access only (if Private)

Path B specific :

- R2 bucket `mozart-releases` accessible via
  `downloads.mozart.build`
- Manual release script works end-to-end on all 3 OSes
- Versioned URLs work

## Final report for 9.1 — 6 sections

1. Executive summary (3 bullets — including which path
   was chosen and why)
2. Web surfaces deployed (table)
3. Distribution layer setup (CrabNebula org + app, OR R2
   bucket structure)
4. Release script — how to use, where it lives, sample
   command
5. Install instructions on `/download`
6. Build / deploy status

---

# Sub-phase 9.2 — Crash reporting

**Effort : Medium. Sessions : 1. Cost : 0 USD (Sentry free
tier).**

Ship this within a week of starting beta. Without it, beta
testers report bugs in Slack / email / Discord and you
chase repro endlessly. With it, you see the stack trace
before the user even types.

## Scope

- Sentry SDK in Angular (`@sentry/angular`)
- Sentry SDK in Rust (`sentry` crate)
- PII scrubbing : prompts, file contents, API keys, GitHub
  identifiers stripped before sending
- Release tagging : every Sentry event tagged with the
  build version (from `package.json` + `Cargo.toml`)
- Sentry DSN baked into the build at build time via env var
- Sentry project setup : separate `mozart-desktop` project

## Out of scope for 9.2

- Sentry-based performance monitoring (overkill for beta)
- Source map upload automation (manual upload via CLI is
  fine for now)
- Distributed tracing
- User feedback widget (post-9.4)

## Acceptance

- Intentional Rust panic → captured by Sentry with PII
  scrubbed
- Intentional Angular error → captured by Sentry with PII
  scrubbed
- Sentry shows release version on each event
- Manual upload of source maps for the current release
  works
- No PII in any captured event (verified by inspecting one
  real captured event)

## Final report for 9.2 — 4 sections

1. Sentry configuration
2. PII scrubbing rules applied
3. Source map workflow
4. Validation results (panic test + Angular error test)

---

# Sub-phase 9.3 — Auto-update

**Effort : Medium. Sessions : 1-2. Cost : 0 USD.**

Ship this after 2-4 weeks of beta. Before then, you push
new versions manually and tell beta testers to re-download.
That's fine for the first 10 testers but breaks fast.

## Scope (Path A — CrabNebula Cloud)

Most of the infra already lands in 9.1. Here you :

- Configure `tauri-plugin-updater` endpoint :
  `https://cdn.crabnebula.app/update/{org-slug}/mozart/{target}/{current_version}`
- Generate the Tauri update signing keypair
  (`tauri signer generate`) — public key in
  `tauri.conf.json`, private key passed to `cn` CLI via env
  var `CN_RELEASE_SIGN_KEY` during release
- Build the in-app "Update available — restart to apply"
  prompt, integrated with `domains/ui-state/`
- Background download + install on relaunch
- Test the full flow : release `v0.1.0-beta.2` via
  `cn release` → existing users see the prompt within 24 h
- Set up GitHub Action via `crabnebula-dev/cloud-release`
  if local CLI gets tedious

## Scope (Path B — DIY R2)

Heavier work here since you build the update server :

- `tauri-plugin-updater` endpoint :
  `https://downloads.mozart.build/latest.json`
- Generate Tauri update signing keypair
  (`tauri signer generate`) — public key in
  `tauri.conf.json`, private key kept in 1Password (NOT in
  repo)
- `latest.json` manifest published to
  `downloads.mozart.build/latest.json` (manually built and
  uploaded by release script)
- Manual release script extended : sign each binary,
  generate `latest.json`, upload everything
- In-app "Update available" prompt (same as Path A)
- Background download + install on relaunch

## Out of scope for 9.3

- Beta vs stable channels (9.7)
- In-app changelog display (9.7 polish)
- Delta updates (Tauri doesn't ship this yet, not worth it
  for app sizes < 50 MB)

## Important caveat

Tauri's auto-updater works **with unsigned binaries** if
the update signature uses the Tauri keypair. You don't
need Apple / Windows OS-level code signing to enable
auto-update. The Tauri update signature is independent of
OS code signing.

## Acceptance

- Release a `v0.1.0-beta.2`
- Existing `v0.1.0-beta.1` users see "Update available"
  within 24 h (or immediately on next launch)
- Click update → download → restart → now on beta.2
- Process works on macOS, Linux, Windows

## Final report for 9.3 — 4 sections

1. Path-specific setup (CrabNebula endpoint OR
   `latest.json` schema)
2. Update signing keypair (location of public key, where
   private key lives, how to rotate)
3. In-app update prompt UX
4. End-to-end update test results per OS

---

# Sub-phase 9.4 — Telemetry & product analytics

**Effort : Medium. Sessions : 1-2. Cost : 0 USD (PostHog
free tier).**

Ship this when you have ~10+ beta testers and want signal
on what they actually do, not just what they say in Slack.
Don't ship this with 2 testers — you'll have no signal,
just noise.

## Scope

- `domains/telemetry/` ships per `plan.md` Phase 9 spec
- Five base events :
  1. `app_launched` — props : `version`, `os`, `arch`
  2. `onboarding_completed`
  3. `project_added`
  4. `prompt_sent` — props : `workspace_id_hashed`,
     `mode` (agent/plan/ask), no content
  5. `pr_created`
- **Opt-in mandatory** — added to onboarding (extends
  Phase 6 onboarding flow with a consent step)
- Persisted in Stronghold (encrypted, same vault as auth)
- Toggle in Settings to change later
- If opt-out : adapter no-ops, zero network calls
- PostHog provider via `posthog-js` (front) — no server-
  side aggregation needed

## Out of scope for 9.4

- Feature flags via PostHog (could land later if useful)
- A/B testing
- Funnel dashboards (PostHog has them built-in, no work
  needed)
- Cohort analysis (PostHog built-in)

## Architectural placement

```
apps/desktop/src/app/domains/telemetry/
├── data/
│   ├── telemetry.facade.ts
│   ├── telemetry.adapter.ts          # interface
│   ├── posthog.adapter.ts            # concrete
│   └── telemetry.store.ts            # opt-in flag
├── feature-opt-in/
│   └── feature-telemetry-opt-in.ts
└── index.ts
```

## Acceptance

- Opt-in flow added to onboarding (a step between current
  steps 3 and 4, or after step 4)
- Five events fire correctly under opt-in (verified in
  PostHog dashboard)
- Opt-out : no events fire, no network calls (verified by
  network inspector)
- Settings toggle works, takes effect immediately
- PII scrubbing : verify a `prompt_sent` event in PostHog
  contains zero prompt content

## Final report for 9.4 — 5 sections

1. Domain structure
2. Five events with their props
3. Opt-in flow location + UX
4. PostHog setup notes
5. PII scrubbing verification

---

# Sub-phase 9.5 — macOS code signing & notarization

**Effort : High. Sessions : 1-2. Cost : 99 USD/year.**

Ship this when beta testers start complaining about the
Gatekeeper bypass step (typically when you onboard non-dev
users, or when a paying customer rolls out internally and
their IT department balks at unsigned apps).

## Pre-requisite

User enrolls in Apple Developer Program (~99 USD/year).
Process : 1-2 days approval.

## Scope

- Developer ID Application certificate downloaded into
  build keychain
- `tauri.conf.json` updated with the Developer ID identity
- Build script signs the `.dmg` and the `.app` inside
- Notarization via `notarytool` (Apple's modern tool)
- Stapling : `xcrun stapler staple` so notarization checks
  work offline
- Both x64 + aarch64 variants signed
- CI/CD : GitHub Actions runner with the certificate
  available via repository secrets

## Out of scope for 9.5

- Mac App Store distribution (different signing process,
  different ToS, much heavier — defer indefinitely)
- Hardened runtime hardening beyond defaults

## Acceptance

- `spctl --assess --verbose` on the signed `.dmg` returns
  green
- Beta tester on a fresh macOS machine : double-click
  install, no warning at all
- Notarization stapled so it works offline
- CI pipeline reproduces signed builds without manual
  intervention

## Final report for 9.5 — 4 sections

1. Certificate management (where it lives, how to renew)
2. Signing + notarization config in `tauri.conf.json`
3. CI integration notes
4. Verification results

---

# Sub-phase 9.6 — Windows Authenticode signing

**Effort : High. Sessions : 1-2. Cost : 200-400 USD/year.**

Ship this when Windows users complain about SmartScreen,
typically when distribution scales beyond technical users.

## Pre-requisite

User purchases a Windows Authenticode certificate.
Options :

- **OV (Organization Validation)** — cheaper (~200 USD/year),
  needs business entity, builds reputation over time
- **EV (Extended Validation)** — pricier (~400 USD/year),
  HSM-required, but **immediate SmartScreen reputation**

For Mozart's solo-founder phase, OV is usually right.
Reputation builds over a few hundred installs.

Alternative : **Azure Trusted Signing** (Microsoft's
managed signing service, no HSM hassle, billed per use).
Phase A decides per current Azure pricing.

## Scope

- Certificate available to CI (as HSM-backed cert or via
  Azure Trusted Signing)
- `tauri.conf.json` Windows signing config
- SignTool integration in the build pipeline
- Both `.exe` installer and inner binary signed
- Timestamp server configured (so signature stays valid
  past cert expiry)
- CI runner has access to signing credentials via
  GitHub Actions secrets

## Acceptance

- `signtool verify /pa Mozart_x.y.z_setup.exe` returns green
- Windows install on fresh machine : SmartScreen still
  warns initially (until reputation builds) but with
  trusted publisher name shown
- After 1-3 months of installs : SmartScreen warning
  disappears entirely
- CI reproduces signed Windows builds

## Final report for 9.6 — 4 sections

1. Certificate type chosen + justification
2. Signing config
3. CI integration notes
4. SmartScreen reputation trajectory (start date + target
   install count)

---

# Sub-phase 9.7 — Multi-channel releases (beta vs stable)

**Effort : Medium (Path A) / Medium-High (Path B). Sessions : 1.
Cost : 0 USD.**

Ship this when you have paying customers (who want stable
only) and beta testers (who want bleeding edge). Until then,
single channel is fine — you have all bleeding-edge users.

## Scope (Path A — CrabNebula Cloud)

CrabNebula natively supports channels via the `--channel`
flag. The infra is already there ; this sub-phase is just
the in-app UX :

- Update `tauri-plugin-updater` endpoint to be channel-aware
  (the channel is part of the URL :
  `.../update/{org}/mozart/{channel}/{target}/{version}`)
- User chooses channel in Settings (default : `stable` for
  new installs)
- Release script takes a `--channel` flag passed to
  `cn release draft --channel beta` or `--channel stable`
- In-app : "Beta channel" badge in the header when on beta
- Switching channels triggers a fresh update check

## Scope (Path B — DIY R2)

More work since you maintain manifests yourself :

- `latest.json` becomes `latest-beta.json` +
  `latest-stable.json`
- Release script writes the right manifest based on
  `--channel` flag
- Same in-app UX as Path A : Settings selector + header
  badge + fresh-check on switch
- Manage retention : oldest 3-5 versions kept per channel
  in R2 ; older purged manually or via lifecycle rule

## Acceptance

- Stable user stays on stable
- Beta user gets pre-release versions
- Switching beta → stable on next update : if a newer
  stable exists, install it ; if not, stay on current
- Both channels keep ~3-5 recent versions for rollback
  ability ; older purged

## Final report for 9.7 — 3 sections

1. Channel configuration (CrabNebula side OR R2 manifests)
2. UX for channel switching (Settings selector + header
   badge)
3. Release workflow per channel + retention policy

---

# Sub-phase 9.8 — Privacy / ToS hardening

**Effort : Low. Sessions : 1. Cost : 0 USD (templated).**

Ship this before doing any real public launch (Product
Hunt, HN, paid acquisition). For beta with friends + indie
devs, a simple placeholder is fine.

## Scope

- Real Privacy Policy at `mozart.build/privacy`
- Real Terms of Service at `mozart.build/terms`
- Cookie policy if you serve any cookies on the landing
  (PostHog uses some — disclose them)
- Linked from :
  - Desktop : onboarding step 1 + Settings footer
  - Web : `app.mozart.build` footer
  - Landing : footer
- GDPR : data processing agreement signed with PostHog +
  Sentry (both have one-click DPAs in their dashboards) if
  EU users are expected
- Data deletion flow : a "Delete my account" button in
  `app.mozart.build/account` (calls a backend endpoint, or
  just emails support for v0.1 simplicity)

## Out of scope

- DPO appointment (not required for Mozart's size)
- Sub-processor list (defer until billing infra ships)

## Acceptance

- Privacy policy mentions PostHog, Sentry, Cloudflare,
  Clerk explicitly
- ToS mentions warranty disclaimer, governing law,
  acceptable use
- Cookie banner on landing if cookies served (else not
  needed)
- DPAs filed
- All footers link to both pages

## Final report for 9.8 — 3 sections

1. Pages published (URLs + content summary)
2. DPAs signed (providers + dates)
3. Cookie policy applied or N/A

---

## Cross-cutting : recommended order

```
9.1 (distribute beta) ← Day 1
  ↓
9.2 (crash reporting) ← Week 1
  ↓
9.3 (auto-update) ← Week 2-4
  ↓
[Use Mozart with beta testers for a few weeks. Gather feedback.]
  ↓
9.4 (telemetry) ← When you have ~10 testers
  ↓
[Continue iterating on the product. The sub-phases below
 are optional and respond to specific pressure.]
  ↓
9.5 (macOS signing) ← When non-dev macOS users join
9.6 (Windows signing) ← When non-dev Windows users join
9.7 (multi-channel) ← When you have paying customers
9.8 (privacy/ToS hardening) ← Before public launch
```

You can run 9.1 → 9.2 → 9.3 back-to-back in 2-4 weeks if
the cost-zero path is what you want. Sub-phases 9.4 through
9.8 specifically benefit from waiting for real-world signal.

---

## Updates to `plan.md`

The original `plan.md` Phase 9 spec described everything as
one monolithic phase. With this incremental approach, the
`plan.md` Phase 9 section should be replaced by a one-line
summary :

```markdown
## Phase 9 — Production readiness (incremental)

Shipped as 8 independent sub-phases (9.1 → 9.8) ordered by
"required for beta" vs "required for scale." See
`docs/prompts/phase-9-prompt.md` for the full breakdown.
```

This makes it clear that Phase 9 isn't a single sprint but
a multi-month progressive rollout that matches the
product's real audience growth.
