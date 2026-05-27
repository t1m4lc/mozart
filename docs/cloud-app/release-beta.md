# Release process — Mozart beta

Step-by-step pour une release beta desktop + web.

---

## Pré-requis

- CI vert sur `main` (lint, typecheck, tests)
- Smoke tests manuels passés sur une preview CF (`<branch>.mozart-web.pages.dev`)
- Version désirée décidée (ex: `0.1.0-beta.1`)

---

## Étape 1 — Bump de version

Mettre à jour la version dans `apps/desktop-tauri/tauri.conf.json` :

```json
"version": "0.1.0-beta.1"
```

---

## Étape 2 — CHANGELOG racine

Créer ou mettre à jour `CHANGELOG.md` à la racine du repo.
Format [Keep a Changelog](https://keepachangelog.com/fr/1.0.0/) :

```markdown
## [0.1.0-beta.1] — YYYY-MM-DD

### Added
- ...

### Fixed
- ...
```

---

## Étape 3 — Changelog marketing dans la landing

Créer le fichier `apps/landing/src/content/changelog/0.1.0-beta.1.md`.

Ce fichier est prérendu par AnalogJS sur `https://mozart.build/changelog/…`
au prochain déploiement de landing.

Consulter les fichiers existants dans `apps/landing/src/content/changelog/`
pour respecter le format frontmatter attendu.

---

## Étape 4 — Commit de release + tag

```bash
git add \
  apps/desktop-tauri/tauri.conf.json \
  CHANGELOG.md \
  apps/landing/src/content/changelog/0.1.0-beta.1.md

git commit -m "chore(release): 0.1.0-beta.1"
git tag v0.1.0-beta.1
git push origin main --tags
```

---

## Étape 5 — Build desktop (CI)

Le tag déclenche le workflow CI (`.github/workflows/ci.yml`) qui lance la
matrice Tauri multi-plateforme : macOS, Windows, Linux.

Attendre la fin du pipeline avant de distribuer. Récupérer les artefacts
depuis GitHub Actions → le run déclenché par le tag.

---

## Étape 6 — Distribution via Google Drive

1. Créer un dossier Google Drive nommé `Mozart Beta — v0.1.0-beta.1`
2. Accès : **"Lien avec demande d'accès"** (les beta testeurs demandent,
   toi tu approuves par email)
3. Uploader les artefacts :
   - `.dmg` — macOS
   - `.msi` — Windows
   - `.AppImage` ou `.deb` — Linux
4. Créer un fichier `README.txt` dans le dossier avec :
   - URL de l'app web : `https://app.mozart.build`
   - Instructions d'installation par plateforme (voir §7 du guide e2e)
   - Email de contact pour signaler des bugs

---

## Étape 7 — Vérifications post-release

- [ ] `https://app.mozart.build` accessible et affiche `/login`
- [ ] `https://mozart.build/changelog/0-1-0-beta-1` visible après déploiement landing
- [ ] Lien Google Drive fonctionnel (tester depuis un compte non-propriétaire)
- [ ] Smoke tests CI (`deploy-web.yml`) passés
- [ ] Voir scénarios complets dans `docs/cloud-app/e2e-scenarios.md`

---

## Checklist Cloudflare (one-time, si pas encore fait)

Voir `docs/cloud-app/cloudflare-notes.md §5` pour la checklist complète :
créer le projet CF Pages `mozart-web`, attacher `app.mozart.build`, configurer
`CLERK_SECRET_KEY` dans les env bindings.
