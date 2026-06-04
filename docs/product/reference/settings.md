# Mozart settings

Mozart resolves settings from three layers. Each layer only needs to carry the
keys it overrides; missing keys fall through to the layer below.

```
bundled defaults  ◀  global user file  ◀  project file
   (in the app)        (your machine)       (per repo)
```

- **Bundled defaults** — defined in the app (`MozartSettings::default()` in
  `apps/desktop-tauri/src/settings.rs`). The canonical machine-readable copy is
  [`settings.default.json`](../../settings.default.json); a unit test fails if the
  two ever drift.
- **Global user file** — `settings.json`, your machine-wide preferences.
- **Project file** — `<repo>/.mozart/settings.json`, committed with a repo so it
  adapts Mozart to that project. **Any key** may be overridden here.

## Where the files live

The global file follows the OS conventions, under the app id `build.mozart.desktop`:

| OS | Global `settings.json` |
|----|------------------------|
| Linux | `~/.config/build.mozart.desktop/settings.json` (honors `$XDG_CONFIG_HOME`) |
| macOS | `~/Library/Application Support/build.mozart.desktop/settings.json` |
| Windows | `%APPDATA%\build.mozart.desktop\settings.json` |

Project file: `<repo>/.mozart/settings.json`.

## Editable vs internal

Only the `settings.json` files (global + project) are meant to be edited by hand.
Everything else Mozart writes is **internal — do not hand-edit**, it can corrupt
the app: the database (`mozart.db`), the `projects/` and `workspaces/` trees, the
cache, and logs (all under the OS data/cache dirs, same app id).

## Complete example (all settings, default values)

The file on disk is strict JSON (no comments); the annotations below are for
documentation only.

```jsonc
{
  "version": "1",                 // schema version (internal)

  "appearance": {
    "theme": "mozart",            // theme name from the catalog
    "colorMode": "system"         // "light" | "dark" | "system"
  },

  "notifications": {
    "desktop": true,              // OS notification at end of turn when unfocused
    "sound": true                 // play the end-of-turn chime
  },

  "timeline": {
    "density": "normal"           // "compact" | "normal" | "detailed"
  },

  "agent": {                      // defaults applied to new chats
    "model": null,                // model id; null = the app's current default
    "mode": "agent",              // "agent" | "plan" | "ask"
    "effort": "medium",           // "low" | "medium" | "high" | "xhigh" | "max"
    "enabledModelIds": []         // composer model allow-list; [] = all runnable
  },

  "git": {
    "baseBranch": "main",         // branch new workspaces fork from
    "mergeAction": "pr"           // "pr" | "local"
  },

  "scripts": {}                   // project run/setup commands (see below)
}
```

## Reference

| Key | Type | Default | Notes |
|-----|------|---------|-------|
| `version` | string | `"1"` | Schema version. Internal. |
| `appearance.theme` | string | `"mozart"` | Theme name from the catalog. |
| `appearance.colorMode` | enum | `"system"` | `light` / `dark` / `system`. |
| `notifications.desktop` | bool | `true` | OS notification on turn end when unfocused. |
| `notifications.sound` | bool | `true` | End-of-turn chime. |
| `timeline.density` | enum | `"normal"` | `compact` / `normal` / `detailed`. |
| `agent.model` | string \| null | `null` | Default model for new chats; `null` = app default. |
| `agent.mode` | enum | `"agent"` | `agent` / `plan` / `ask`. |
| `agent.effort` | enum | `"medium"` | `low` / `medium` / `high` / `xhigh` / `max`. |
| `agent.enabledModelIds` | string[] | `[]` | Models shown in the composer picker (Settings → Composer models). `[]` = all runnable. See [Providers & models](#providers--models). |
| `git.baseBranch` | string | `"main"` | Branch new workspaces fork from. |
| `git.mergeAction` | enum | `"pr"` | `pr` / `local`. |
| `scripts` | ordered map | `{}` | Project run/setup commands. |

### `scripts`

`scripts` supersedes the older `.mozart/run.json`. It's an **ordered** object —
key order drives the Run/Setup tab order in the UI (left tab = first key):

```json
{
  "scripts": {
    "setup": "npm i",
    "run": "npm start"
  }
}
```

You can add more named tasks (e.g. `"test"`, `"lint"`). Scripts are
project-scoped in practice; a global value would be meaningless.

## Providers & models

Mozart runs your prompts through an **agent provider** CLI. Two are available
today; more are planned:

| Provider | Status | Auth |
|----------|--------|------|
| **Claude Code** (Anthropic) | Available | `claude login` (Pro/Max) **or** an `ANTHROPIC_API_KEY` |
| **Codex** (OpenAI) | Available | `codex login` (ChatGPT) **or** an `OPENAI_API_KEY` |
| **Local** (Ollama) | Coming soon | — |
| **Mozart Cloud** | Coming soon | — |

Connect one or more during onboarding, or anytime in **Settings → Connections**.
At least one provider must be connected to run an agent. Keys are stored in your
OS keychain — never synced, never logged. A run is routed to whichever provider
is connected (Claude is preferred when both are).

**Composer models.** Settings → Composer models picks which models appear in the
composer's model dropdown, grouped by provider, persisted as
`agent.enabledModelIds` (model **ids** only). An empty list shows all runnable
models; at least one must stay enabled. If a chat's selected model is later
disabled, the composer falls back to an enabled one.

> **Limitation (static catalog).** The model list is a hand-maintained catalog
> in the app, not discovered from each provider. The picked model is passed to
> the CLI (`claude --model <alias>`, `codex -m <model>`) using stable Claude
> aliases (`opus`/`sonnet`/`haiku`) and the Codex model id; if a model belongs
> to a provider other than the one running the turn, the CLI's own default is
> used instead.

## Notes & caveats

- **Project overrides everything** — by design, a repo's `.mozart/settings.json`
  can override any key above, including appearance.
- **The agent sandbox level is intentionally NOT a setting.** It stays
  app-controlled so a cloned repo cannot widen its own filesystem sandbox.
- **Malformed or partial files are safe** — a missing key falls through to the
  layer below; an unparseable file is ignored (Mozart logs and uses the lower
  layer), so a bad edit never bricks the app.
- **Unknown keys are ignored**, which keeps older app versions forward-compatible
  with newer files.
