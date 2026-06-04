# Desktop Release Automation — Mozart

État cible pour `v0.1.0-beta.1` et au-delà : releases desktop automatisées,
mises à jour silencieuses chez les users, versions synchronisées entre tous les
fichiers concernés. Beta.0 (mai 2026) est sorti via Google Drive — ce doc
décrit la transition vers une release "vraie production" à partir de beta.1.

---

## 1. Vue d'ensemble

Trois pièces indépendantes qui doivent fonctionner ensemble :

| Pièce | Rôle | Outil |
|---|---|---|
| **Build matrix** | Compile macOS (arm + intel), Windows, Linux à chaque tag `v*` | `tauri-apps/tauri-action` dans une nouvelle `release.yml` |
| **Auto-updater** | Vérifie au boot, télécharge en arrière-plan, affiche un bouton "Restart to install" dans l'UI. L'user choisit quand restart. | `@tauri-apps/plugin-updater` + clés ed25519 |
| **Distribution** | Héberge les artefacts (`.dmg`, `.msi`, `.AppImage`) + le manifeste `latest.json` que l'updater consulte | GitHub Releases (gratuit, atomique avec le tag) |

Flux de release : push tag `v0.1.0-beta.1` → CI build les 3 plateformes → CI
signe les bundles → CI crée la GitHub Release avec les bundles + `latest.json`
→ les apps déjà installées détectent la nouvelle version au prochain
démarrage → téléchargent silencieusement → bouton "Restart to install"
apparaît dans l'UI → l'user clique quand il veut.

### Modèle de déploiement : tag pour web/desktop, main pour landing

Les trois surfaces n'ont pas le même rythme de release :

- **Landing** (`mozart.build`) → push sur main déploie en prod. Contenu
  marketing, change souvent (blog posts, changelog narratif, fixes copy).
  Pas besoin de tag pour publier une typo.
- **Web** (`app.mozart.build`) → tag `v*` déploie en prod. Pousser sur main
  ne touche pas la prod, seulement les PR créent des previews.
- **Desktop** → tag `v*` build + signe + publie GitHub Release. Idem web,
  les deux surfaces partagent les contrats auth/protocole et doivent
  bouger ensemble.

Concrètement : `deploy-landing.yml` reste sur le trigger `push: branches: [main]`.
`deploy-web.yml` passe à `push: tags: ['v*']` (avec `pull_request:` pour
les previews). Tag → web prod + desktop release en parallèle. Détail
dans §4.5.

---

## 2. Version sync — fichiers à toucher

Six fichiers contiennent la version `0.1.0-beta.1`. Tous doivent rester
alignés à chaque release :

| Fichier | Champ | Notes |
|---|---|---|
| `apps/desktop-tauri/tauri.conf.json` | `version` | Source de vérité pour Tauri (le bundler lit cette valeur) |
| `apps/desktop-tauri/Cargo.toml` | `version` | Doit matcher `tauri.conf.json` (warning sinon au build) |
| `apps/landing/src/content/changelog/v<version>.md` | frontmatter `version` | Nouveau fichier par release. Prérendu sur `mozart.build/changelog/v-<slug>` |
| `CHANGELOG.md` (racine) | nouvelle section `## [<version>]` | À créer pour beta.1 — pas encore au repo |
| `package.json` (racine) | `version` | Optionnel mais utile pour `npm version` côté tooling |
| Git tag | `vX.Y.Z` | Préfixé `v` — c'est le tag qui déclenche `release.yml` |

**Automatisation** : un script `tools/release-bump.mjs` qui prend la nouvelle
version en argument et écrit les 6 endroits + crée le commit `chore(release):
vX.Y.Z` + tag. Implémentation : ~50 lignes de Node + `replace-in-file`. Alternative :
[`nx release`](https://nx.dev/recipes/nx-release/release-projects-independently)
si on veut intégrer plus profondément à Nx.

---

## 3. Auto-updater — architecture

### 3.1 Pré-requis (one-time setup)

1. **Générer les clés de signature** :
   ```bash
   pnpm tauri signer generate -w ~/.tauri/mozart-updater.key
   ```
   Produit `mozart-updater.key` (privée — JAMAIS commit) et
   `mozart-updater.key.pub` (publique — vit dans `tauri.conf.json`).

2. **Ajouter le plugin updater** :
   ```bash
   pnpm add @tauri-apps/plugin-updater
   cd apps/desktop-tauri && cargo add tauri-plugin-updater
   ```

3. **Configurer `tauri.conf.json`** :
   ```jsonc
   "plugins": {
     "updater": {
       "endpoints": [
         "https://github.com/t1m4lc/mozart/releases/latest/download/latest.json"
       ],
       "pubkey": "<contenu de mozart-updater.key.pub>"
     }
   }
   ```

4. **Stocker la clé privée dans GitHub Secrets** :
   - `TAURI_SIGNING_PRIVATE_KEY` = contenu base64 de `mozart-updater.key`
   - `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` = (vide si pas de passphrase à la génération)

### 3.2 Code app (apps/desktop)

Trois étapes : check au boot, download silencieux, expose un signal "ready"
que l'UI consomme pour afficher le bouton restart.

```typescript
// apps/desktop/src/app/core/updater.service.ts
import { Injectable, signal } from '@angular/core';
import { check } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';

@Injectable({ providedIn: 'root' })
export class UpdaterService {
  readonly updateReady = signal<{ version: string } | null>(null);

  async checkOnBoot() {
    try {
      const update = await check();
      if (!update) return;
      await update.downloadAndInstall();   // silencieux, en arrière-plan
      this.updateReady.set({ version: update.version });
    } catch (err) {
      // Pas grave — l'user peut continuer à utiliser l'ancienne version
      console.warn('Updater check failed', err);
    }
  }

  async restart() {
    await relaunch();
  }
}
```

Bootstrap au boot :

```typescript
// apps/desktop/src/app/app.config.ts
provideAppInitializer(() => inject(UpdaterService).checkOnBoot()),
```

UI : un composant qui watch `updaterService.updateReady()` et affiche un
toast / banner / menu-bar item :

```html
@if (updater.updateReady(); as ready) {
  <hlm-banner>
    Update {{ ready.version }} ready —
    <button (click)="updater.restart()">Restart to install</button>
  </hlm-banner>
}
```

**Pourquoi ce pattern** : auto-check (l'user n'a rien à faire), auto-download
(pas d'attente après le clic), restart manuel (pas d'interruption d'un Run
en cours). Le bouton sert d'opt-in explicite.

### 3.3 Manifest `latest.json`

Le fichier que l'updater consulte. Format Tauri v2 :

```json
{
  "version": "0.1.0-beta.2",
  "notes": "See https://mozart.build/changelog/v-0-1-0-beta-2",
  "pub_date": "2026-06-15T10:00:00Z",
  "platforms": {
    "darwin-aarch64": {
      "signature": "<sig>",
      "url": "https://github.com/t1m4lc/mozart/releases/download/v0.1.0-beta.2/Mozart_0.1.0-beta.2_aarch64.app.tar.gz"
    },
    "darwin-x86_64": { ... },
    "windows-x86_64": { ... },
    "linux-x86_64": { ... }
  }
}
```

`tauri-action` génère ce fichier automatiquement à partir des artefacts buildés.

---

## 4. Release CI workflow

Nouveau fichier : `.github/workflows/release.yml`. Indépendant de `ci.yml`
(qui reste pour les builds incrémentaux PR/main).

```yaml
name: Release Desktop

on:
  push:
    tags: ['v*']
  workflow_dispatch:

jobs:
  release:
    permissions:
      contents: write   # createRelease
    strategy:
      fail-fast: false
      matrix:
        include:
          - { platform: macos-latest,  args: '--target aarch64-apple-darwin' }
          - { platform: macos-latest,  args: '--target x86_64-apple-darwin' }
          - { platform: ubuntu-latest, args: '' }
          - { platform: windows-latest, args: '' }
    runs-on: ${{ matrix.platform }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 11.0.8 }
      - uses: actions/setup-node@v4
        with: { node-version: 22, cache: pnpm }
      - run: pnpm install --frozen-lockfile

      - name: Install Linux deps
        if: matrix.platform == 'ubuntu-latest'
        run: |
          sudo apt-get update
          sudo apt-get install -y libwebkit2gtk-4.1-dev libappindicator3-dev \
            librsvg2-dev patchelf libsoup-3.0-dev libjavascriptcoregtk-4.1-dev

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          TAURI_SIGNING_PRIVATE_KEY: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY }}
          TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ${{ secrets.TAURI_SIGNING_PRIVATE_KEY_PASSWORD }}
        with:
          projectPath: apps/desktop-tauri
          tagName: ${{ github.ref_name }}
          releaseName: 'Mozart ${{ github.ref_name }}'
          releaseBody: 'See https://mozart.build/changelog/${{ github.ref_name }} for the changelog.'
          releaseDraft: true
          prerelease: ${{ contains(github.ref_name, 'beta') || contains(github.ref_name, 'alpha') }}
          args: ${{ matrix.args }}
          includeUpdaterJson: true
```

Ce que `tauri-action` fait automatiquement :
- Build le frontend (via `beforeBuildCommand` dans `tauri.conf.json`)
- Build le bundle Tauri (`.dmg`, `.msi`, `.AppImage`, etc.)
- Signe les artefacts avec la clé privée
- Crée / met à jour la GitHub Release avec les artefacts + `latest.json`

**Note** : `releaseDraft: true` pour pouvoir relire avant de publier. Une
fois la release publiée manuellement, `latest.json` devient accessible via
`/releases/latest/download/latest.json` — l'updater commence à voir
la nouvelle version.

### 4.5 Modifier `deploy-web.yml` — tag-only prod

Seul `deploy-web.yml` change. `deploy-landing.yml` reste sur `push: branches: [main]`.

```yaml
# deploy-web.yml AVANT
on:
  push:
    branches: [main]
    paths: [...]
  pull_request:
    paths: [...]

# deploy-web.yml APRÈS
on:
  push:
    tags: ['v*']
  pull_request:
    paths: [...]
```

Dans la step de deploy on garde CF Pages tel quel — pas besoin de
reconfigurer la "production branch" côté CF. On force `--branch=main`
sur les tag pushes pour que le deploy atterrisse sur le slot que CF
considère déjà comme prod :

```yaml
# AVANT
--branch=${{ github.head_ref || github.ref_name }}

# APRÈS
--branch=${{ startsWith(github.ref, 'refs/tags/') && 'main' || github.head_ref || github.ref_name }}
```

Effet :
- Tag push → wrangler déploie sur la branche CF `main` (= prod, car
  c'est le default production branch de CF Pages) → `app.mozart.build`
  mis à jour.
- PR → wrangler déploie sur la branche CF du PR → URL preview
  `<branch>.mozart-web.pages.dev`.
- Push direct sur main → ne déclenche plus le workflow (les fixes web
  passent par tag ou PR).

Les steps gated `if: github.event_name == 'push' && github.ref == 'refs/heads/main'`
(sync secrets Clerk) deviennent `if: startsWith(github.ref, 'refs/tags/')`.

---

## 5. Step-by-step — `v0.1.0-beta.1` (première release "vraie")

**Avant** : on est sur `v0.1.0-beta.0` distribué via Drive. Aucun updater
configuré côté app. La beta.0 ne pourra pas auto-update vers beta.1 — il
faudra que les beta-testers réinstallent manuellement.

### Phase 0 — Setup auto-updater (1× total, avant beta.1)

1. Générer les clés : `pnpm tauri signer generate -w ~/.tauri/mozart-updater.key`
2. Mettre la clé publique dans `apps/desktop-tauri/tauri.conf.json` → `plugins.updater.pubkey`
3. Ajouter le endpoint dans la même section
4. Stocker la clé privée dans GitHub Secrets : `TAURI_SIGNING_PRIVATE_KEY`
5. Ajouter les deps : `pnpm add @tauri-apps/plugin-updater @tauri-apps/plugin-process` + `cargo add tauri-plugin-updater tauri-plugin-process`
6. Enregistrer le plugin dans `apps/desktop-tauri/src/lib.rs` (`.plugin(tauri_plugin_updater::Builder::new().build())`)
7. Wrapper côté Angular : `checkForUpdates()` appelé au boot

### Phase 1 — Préparer la release

```bash
# Bump version partout
node tools/release-bump.mjs 0.1.0-beta.1   # à écrire (voir §2)

# Vérifier le diff
git diff apps/desktop-tauri/tauri.conf.json \
        apps/desktop-tauri/Cargo.toml \
        CHANGELOG.md \
        apps/landing/src/content/changelog/v0-1-0-beta-1.md \
        package.json
```

### Phase 2 — Écrire les changelogs

- `CHANGELOG.md` (racine, format Keep a Changelog) — pour les devs / GitHub Release
- `apps/landing/src/content/changelog/v0-1-0-beta-1.md` — pour `mozart.build/changelog/v-0-1-0-beta-1`, format frontmatter + markdown narratif

### Phase 3 — Commit + tag + push

```bash
git add -A
git commit -m "chore(release): v0.1.0-beta.1"
git tag v0.1.0-beta.1
git push origin main --tags
```

### Phase 4 — CI fait son travail

- `.github/workflows/release.yml` se déclenche sur le tag
- 4 jobs en parallèle (macOS arm, macOS intel, Linux, Windows)
- Chaque job build, signe, et upload sur la GitHub Release (en draft)
- ~15 min total

### Phase 5 — Publier la release

1. Aller sur `https://github.com/t1m4lc/mozart/releases` → trouver le draft v0.1.0-beta.1
2. Vérifier que les 4 artefacts sont là (`.dmg` arm + intel, `.msi`, `.AppImage`)
3. Vérifier que `latest.json` est présent
4. Cliquer "Publish release"

À partir de ce moment, `https://github.com/t1m4lc/mozart/releases/latest/download/latest.json`
sert le manifest — les beta-testers qui ont déjà l'app installée verront la
notification au prochain boot (à partir de beta.2 ; beta.0 n'a pas
l'updater donc reste sur Drive).

### Phase 6 — Smoke test post-publish

- [ ] `https://mozart.build/changelog/v-0-1-0-beta-1` se charge (déploiement landing déclenché par le push main)
- [ ] `https://app.mozart.build/login` accessible
- [ ] Télécharger le `.dmg` depuis la release, l'installer, sign-in OK
- [ ] Lancer l'app, vérifier qu'elle ne propose PAS d'update (déjà sur la dernière version)

### Phase 7 — Notification aux beta-testers

Email aux beta.0 testers avec :
- Lien GitHub Release `https://github.com/t1m4lc/mozart/releases/tag/v0.1.0-beta.1`
- Note : "désinstaller la beta.0 d'abord pour éviter les conflits de signature"
- À partir de beta.2, ils n'auront plus à faire ça — l'app se mettra à jour seule

---

## 6. Cycle de release récurrent (beta.2 et au-delà)

Une fois Phase 0 faite, chaque release suit :

1. `node tools/release-bump.mjs 0.1.0-beta.2`
2. Écrire les deux changelogs
3. Commit + tag + push
4. Attendre 15 min, publier la release draft sur GitHub
5. Les apps installées détectent la maj au prochain boot

Pas de Drive, pas d'email à chaque release. Les beta-testers laissent l'app
se mettre à jour.

---

## 7. Docs liées

- `docs/engineering/release/beta-release-checklist.md` — runbook historique de beta.0 (Drive),
  à archiver dans `docs/archive/` après le succès de beta.1
- `docs/engineering/release/cloudflare-notes.md` — config CF Pages pour `app.mozart.build`
  et `mozart.build`, indépendant du desktop
- `docs/engineering/release/release-validation-scenarios.md` — scénarios de validation manuelle post-release

---

## 7.5. Canary releases & monitoring PostHog (futur)

Tout ce qui suit est **à implémenter quand on aura 100+ users**. Pour la
phase beta actuelle (~10 testeurs), la release tout-le-monde-en-même-temps
suffit. Mais autant documenter l'architecture cible maintenant.

### 7.5.1 Pourquoi canary

Releaser à 100% des users d'un coup = si la version est broken, tout le
monde est cassé en même temps. Canary = on déploie d'abord à un sous-ensemble,
on monitore (crash rate, errors, latency), on généralise si OK, on rollback
si pas OK. Standard pour toute app desktop qui a une vraie base d'users
(VS Code "Insiders", Figma desktop beta channel, etc.).

### 7.5.2 Channel-based (étape 1, simple)

Deux channels : `stable` (défaut) et `canary` (opt-in via Settings).

- App stocke `channel: 'stable' | 'canary'` en local (préférence user).
- `UpdaterService` détermine l'endpoint au boot :
  - `stable` → `https://github.com/t1m4lc/mozart/releases/latest/download/latest.json`
  - `canary` → `https://github.com/t1m4lc/mozart/releases/download/<canary-tag>/latest.json`
- `release.yml` tagge en `v0.1.0-beta.2-canary.1` pour les canary, en `v0.1.0-beta.2` pour stable. Une fois la canary stabilisée pendant N jours, on retag la même SHA en `v0.1.0-beta.2` → users stable l'auront.

Côté UI : Settings → "Receive canary updates" toggle. Quand activé, restart pour switcher l'endpoint.

Pas besoin de Cloudflare Worker ni d'identité user — c'est juste un choix local.

### 7.5.3 Percentage rollout (étape 2, sophistiqué)

Pour déployer "à 10% des users" sans qu'ils choisissent : il faut un serveur entre l'app et GitHub Releases.

**Architecture** :

```
App boot
  ↓ GET https://updates.mozart.build/latest.json?uid=<hash>
  ↓
CF Worker
  ├─ Read PostHog feature flag `update_rollout_v0.1.0-beta.2` for user <hash>
  ├─ If flag = true: return latest.json pointing at new bundles
  └─ Else: return latest.json pointing at previous version's bundles
  ↓
App
  ├─ Compare with current version
  └─ Download + install if newer
```

**Pièces à mettre en place** :
1. Le custom Cloudflare Worker à `updates.mozart.build` qui sert les `latest.json` dynamiquement
2. Stable user identifier (hash du machine ID Tauri — déjà émis par PostHog)
3. PostHog feature flag `desktop_update_rollout_<version>` configuré à X% rollout
4. Endpoint dans `tauri.conf.json` qui pointe sur le worker au lieu de GitHub direct

Cette approche permet aussi un **kill-switch** : si la nouvelle version a un bug grave, désactive le feature flag dans PostHog → tous les users qui boot après revoient l'ancien `latest.json` → pas de regression supplémentaire. Les users qui ont déjà installé doivent rollback manuellement (downgrade depuis GitHub Releases).

### 7.5.4 Monitoring PostHog

Track les events updater à chaque étape pour avoir une vue claire de la santé d'une release :

```typescript
// libs/desktop-shell-feature/src/lib/updater.service.ts
async checkOnBoot() {
  posthog.capture('app_boot', { version: APP_VERSION });
  try {
    const update = await check();
    if (!update) {
      posthog.capture('updater_no_update_available');
      return;
    }
    posthog.capture('updater_update_available', {
      from_version: APP_VERSION,
      to_version: update.version,
    });
    await update.downloadAndInstall();
    posthog.capture('updater_download_completed', {
      from_version: APP_VERSION,
      to_version: update.version,
    });
    this.updateReady.set({ version: update.version });
  } catch (err) {
    posthog.capture('updater_failed', {
      error: String(err),
      version: APP_VERSION,
    });
  }
}

async restart() {
  posthog.capture('updater_restart_clicked');
  await relaunch();
}
```

**Dashboards PostHog à monter** :

| Insight | Détecte |
|---|---|
| Version distribution (pie de `app_boot` group by version) | Combien d'users sur chaque version |
| Conversion funnel `updater_update_available` → `updater_download_completed` → `updater_restart_clicked` | Combien d'users finissent par restart |
| Crash rate par version (events JS error group by version) | Si une nouvelle version est plus crashy que l'ancienne |
| Time-to-restart histogram (timestamp `updater_restart_clicked` - `updater_update_available`) | Combien de temps les users diffèrent l'update |
| Geographic / OS breakdown des erreurs `updater_failed` | Si une plateforme spécifique fail |

**Alertes PostHog** (Insights → Alerts) :
- Crash rate v0.1.0-beta.2 > 5% sur 1h → email
- `updater_failed` > 10% des `updater_update_available` → email

### 7.5.5 Roadmap d'adoption

| Phase | Quand | Quoi |
|---|---|---|
| Beta (~10 users) | Maintenant | Pas de canary. Channel unique. Tracker les events PostHog dès beta.2. |
| Beta élargi (~100 users) | Q3 2026 | Channel-based canary (§7.5.2). Settings toggle "Insiders". |
| Public (~1000+) | v0.1.0 stable | Percentage rollout via CF Worker (§7.5.3). Kill-switch flag PostHog. |

---

## 8. TODOs avant beta.1

- [x] Générer la paire de clés updater (§3.1)
- [x] Ajouter `TAURI_SIGNING_PRIVATE_KEY` dans GitHub Secrets
- [x] Configurer le plugin updater dans `tauri.conf.json` + `lib.rs` + bootstrap Angular
- [x] Créer `UpdaterService` + entrée discrète dans le menu Help (§3.2)
- [x] Créer `tools/release-bump.mjs` (§2)
- [x] Créer `.github/workflows/release.yml` (§4)
- [x] Modifier `deploy-web.yml` : trigger sur tag (§4.5). `deploy-landing.yml` inchangé.
- [x] Créer `CHANGELOG.md` à la racine
- [ ] Test dry-run du workflow release sur un tag de test (ex: `v0.1.0-beta.1-rc.1`)
