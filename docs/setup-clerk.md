# Setting up Clerk for Mozart

Mozart's apps/web surface authenticates users through [Clerk](https://clerk.com).
This document walks through the one-time Clerk-side configuration you
need so the sign-in flow works end-to-end in development.

> **Scope** : everything you need for local development (sign in via
> Google or GitHub, hand off a JWT to the desktop). Production hosting
> (custom domain, environment-specific keys) is out of scope here —
> the steps below cover Clerk's development instance, which is enough
> to run `pnpm nx serve web` against a real Clerk OAuth round-trip.

## 1. Create a Clerk application

1. Sign up at <https://clerk.com> (free tier is plenty for development).
2. From the dashboard, click **Create application**.
3. Name it `Mozart` (or whatever you prefer ; the name shown to users
   on the OAuth provider consent screen lives elsewhere).
4. Under **Sign-in options**, enable :
   - **Google** (one-click — Clerk provides the OAuth app)
   - **GitHub** (one-click — Clerk provides the OAuth app)
5. Leave everything else at its default. Click **Create application**.

Clerk takes you to the **API keys** screen. Keep this tab open — you
will need the **publishable key** in step 4.

## 2. Configure the `mozart` JWT template

The desktop reads an `onboarding` claim out of the JWT to decide
whether to route the user into `/onboarding` or `/`. Clerk lets you
configure custom JWT templates that bake user metadata into the token.

1. In the Clerk dashboard, open **JWT Templates** (under "Configure").
2. Click **+ New template**.
3. Pick **Blank** as the starting point.
4. Set the **Name** to exactly `mozart` (lowercase, no spaces — the
   front-end calls `getToken({ template: 'mozart' })`).
5. Set the **Token lifetime** to `604800` (7 days). The desktop uses
   the JWT's `exp` claim to decide when to prompt for re-auth.
6. In the **Claims** editor, paste :

   ```json
   {
     "name": "{{user.full_name}}",
     "email": "{{user.primary_email_address}}",
     "github_username": "{{user.external_accounts.github.username}}",
     "onboarding": "{{user.unsafe_metadata.onboarding}}"
   }
   ```

7. **Save**.

> Clerk renders missing template variables as `null` rather than
> failing the token — the desktop's JWT decoder accepts missing
> fields and falls back to safe defaults (`onboarding ?? false`,
> empty name, etc.).

## 3. Configure Clerk's development host + paths

Clerk needs to know **where** your local app lives and **which paths**
serve sign-in, sign-up, and post-auth landings. Without this the
OAuth flow creates a sign-in attempt successfully but never redirects
to GitHub / Google — Clerk falls back to its hosted Account Portal
URL, the browser bounces back to your app's redirect target without
a session, and the dashboard shows "Mozart isn't responding".

### 3.1 Add apps/web's origin

1. In the dashboard, open **Domains**.
2. Under **Development**, add `https://localhost:4201`.
3. Save.

> The Mozart dev server runs apps/web at `https://localhost:4201`
> (see `apps/web/project.json` — `ssl: true`). The first browser
> visit prompts you to accept the Angular self-signed cert — that's
> expected, accept it once and Clerk's redirects work for the rest
> of the session.

### 3.2 Set the Fallback Development Host

1. In the dashboard, open **Customization → Paths** (sometimes nested
   under **Configure → Paths**, depending on Clerk's UI version).
2. Set **Fallback Development Host** to `https://localhost:4201`.
3. Save.

This tells Clerk : "when running in development mode, route all
post-OAuth redirects through this origin." Without it Clerk uses
its `clerk.accounts.dev` Account Portal hostname and never reaches
apps/web.

### 3.3 Set the path values

In the same **Paths** screen, with the host set to
`https://localhost:4201`, populate the path fields :

| Field | Value |
| --- | --- |
| **Home URL** | `https://localhost:4201/dashboard` |
| **Unauthorized sign-in URL** | `https://localhost:4201/login` |
| **Sign-in page on development host** | `https://localhost:4201/login` |
| **Sign-up page on development host** | `https://localhost:4201/login` |
| **Signing out page on development host** | `https://localhost:4201/login` |

`/login` is the unified hub Mozart's apps/web exposes — it captures
the desktop's `?state=…&port=…` handoff query params and, when the
user is already authed, also mounts the **Launch Mozart desktop**
button. Routing all Clerk transitions through it preserves the
desktop handoff state across the round-trip.

The Clerk Account Portal URLs can remain available (Clerk auto-hosts
them on `clerk.accounts.dev`), but Mozart's desktop handoff
**must** start from `/login` so the `state` and `port` survive.

### 3.4 Sanity check

The Clerk dashboard's **Quickstart** tab usually shows a green tick
next to each provider once everything is wired :

- GitHub / Google enabled under **User & Authentication →
  Social Connections**.
- `https://localhost:4201` listed under **Domains**.
- All five path fields populated as above.
- The `mozart` JWT template exists with the claims from §2.

If the dashboard surfaces a yellow warning instead, fix that first —
the OAuth flow won't redirect until every quickstart item is green.

## 4. Wire the publishable key

`apps/web/src/env.ts` is **gitignored** so each developer keeps their
own Clerk instance key locally. A committed `env.example.ts` sits
next to it as a template.

1. Copy the template to create your local copy :

   ```bash
   cp apps/web/src/env.example.ts apps/web/src/env.ts
   ```

2. Copy the **Publishable key** from the Clerk dashboard's **API keys**
   screen — it starts with `pk_test_…` for development instances.
3. Open `apps/web/src/env.ts` and replace the placeholder :

   ```ts
   export const env = {
     clerkPublishableKey: 'pk_test_PASTE_YOUR_PUBLISHABLE_KEY_HERE',
   };
   ```

   with your actual key :

   ```ts
   export const env = {
     clerkPublishableKey: 'pk_test_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
   };
   ```

> The publishable key is **public** — Clerk's SDK ships it in client
> code by design. Only the matching **secret key** (used on Clerk's
> backend / a server you operate) must be kept private. Mozart has
> no server-side auth path so the secret key is never needed here.

## 5. Run it

```bash
# In one terminal :
pnpm nx tauri dev desktop

# In another :
pnpm nx serve web
```

1. The Mozart desktop window opens on `/welcome`. Click **Sign in**.
2. Your default browser opens `https://localhost:4201/login?state=…&port=…`.
3. Click **Sign in with GitHub** (or Google). Clerk handles the OAuth
   redirect, the user authorizes, and the browser returns to
   `/auth-callback`.
4. Once Clerk's session is resolved, you land on `/dashboard` with a
   "Launch Mozart desktop" button.
5. Click **Launch** — apps/web `fetch()`-es the localhost HTTP
   callback, the desktop receives the token, validates the state
   nonce, persists the session in the OS keyring, and navigates
   inside the app.

If something fails, the apps/web `/dashboard` surfaces a
"Mozart isn't responding" state with a Retry button. Common causes :

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| "Clerk not loaded" | Publishable key still has the placeholder string | Paste the real key into `apps/web/src/env.ts` |
| Click "Sign in with GitHub" → POST `/v1/client/sign_ins` → page nav straight to `/auth-callback` (no GitHub OAuth screen) | Clerk's **Fallback Development Host** or one of the path fields is empty | §3.2 + §3.3 above — populate every row, save, refresh the tab |
| OAuth redirect lands on a Clerk error page | `https://localhost:4201` not added to **Domains** | §3.1 above |
| Desktop console says "state mismatch" | The browser tab has a stale `port` in `localStorage` from a previous desktop boot | Click **Sign in** on the desktop again — a fresh URL replaces the stale values |
| `getToken({ template: 'mozart' })` returns null | JWT template named `mozart` doesn't exist | §2 above ; confirm the name is exactly `mozart`, lowercase |
| `/auth-callback` shows the spinner forever | Clerk's session never resolved — usually the Fallback Development Host trio not all set | §3.2 + §3.3 above |

## 6. Optional : link GitHub for repository operations

Step 4 of the onboarding wizard offers to connect a GitHub account so
Mozart can push branches and open Pull Requests on your behalf. For
v0.1.0-beta.1 this still uses a **Personal Access Token** flow under the
hood ; the Clerk OAuth identity from sign-in is read-only and does
not include the `repo` scope.

A post-MVP iteration will surface the Clerk-mediated OAuth identity
(via the `github_username` claim added in step 2 above) as the
preferred path and demote the PAT input to "Advanced". For now both
work side-by-side ; the PAT lives in the OS keyring just like the
auth session.
