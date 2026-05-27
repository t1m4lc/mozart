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

### Modèle de déploiement : tag = prod, main = preview

À partir de beta.1, on découple les deploys web/landing du push main :

- **`git push origin main`** → déploie en **preview** uniquement
  (`<branch>.mozart-web.pages.dev`, `<branch>.mozart-landing.pages.dev`).
  Aucun user ne voit. Tu peux pousser autant que tu veux entre deux releases.
- **`git tag v* && git push --tags`** → déclenche les trois prods
  simultanément : `app.mozart.build`, `mozart.build`, et la GitHub Release
  desktop. Un tag = un événement de release atomique.

Implémentation : changer le trigger dans `deploy-web.yml` et `deploy-landing.yml`
de `push: branches: [main]` à `push: tags: ['v*']` pour la prod, et garder
`pull_request:` pour les previews. Détail dans §4.5.

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

### 4.5 Modifier `deploy-web.yml` et `deploy-landing.yml` — tag-only prod

Aujourd'hui ces deux workflows déploient en prod sur chaque push main.
On veut : prod = tag uniquement, main = preview seulement.

Changement dans les triggers :

```yaml
# AVANT
on:
  push:
    branches: [main]
    paths: [...]
  pull_request:
    paths: [...]
  workflow_dispatch:

# APRÈS
on:
  push:
    tags: ['v*']                 # tag = prod deploy
  pull_request:
    paths: [...]                 # PR = preview deploy
  workflow_dispatch:
```

Et dans la step de deploy :

```yaml
# AVANT
--branch=${{ github.head_ref || github.ref_name }}

# APRÈS — sur tag, force la branche CF "production"
--branch=${{ startsWith(github.ref, 'refs/tags/') && 'production' || github.head_ref || github.ref_name }}
```

Côté CF Pages, configurer `app.mozart.build` et `mozart.build` pour pointer
sur la branche `production` (pas `main`). Les autres branches (PR previews,
pushes main directs si on garde un trigger main) restent en
`<branch>.mozart-*.pages.dev`.

**Option** : garder un trigger `push: branches: [main]` qui déploie sur une
branche CF nommée `staging` accessible via `staging.mozart-web.pages.dev`.
Utile pour QA continu sans toucher la prod. Pas obligatoire pour beta.1.

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

- `docs/cloud-app/release-beta.md` — runbook historique de beta.0 (Drive),
  à archiver dans `docs/archive/` après le succès de beta.1
- `docs/cloud-app/cloudflare-notes.md` — config CF Pages pour `app.mozart.build`
  et `mozart.build`, indépendant du desktop
- `docs/cloud-app/e2e-scenarios.md` — scénarios de validation manuelle post-release

---

## 8. TODOs avant beta.1

- [ ] Générer la paire de clés updater (§3.1)
- [ ] Ajouter `TAURI_SIGNING_PRIVATE_KEY` dans GitHub Secrets
- [ ] Configurer le plugin updater dans `tauri.conf.json` + `lib.rs` + bootstrap Angular
- [ ] Créer `UpdaterService` (Angular) + composant UI bouton "Restart to install" (§3.2)
- [ ] Créer `tools/release-bump.mjs` (script de version sync, §2)
- [ ] Créer `.github/workflows/release.yml` (§4)
- [ ] Modifier `deploy-web.yml` + `deploy-landing.yml` : trigger sur tag, plus sur main (§4.5)
- [ ] Reconfigurer CF Pages : `app.mozart.build` et `mozart.build` pointent sur la branche CF `production`
- [ ] Créer `CHANGELOG.md` à la racine
- [ ] Test dry-run du workflow release sur un tag de test (ex: `v0.1.0-beta.1-rc.1`)
