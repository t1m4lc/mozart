# Mozart Release Runbook

**Ce que TOI tu fais pour sortir une nouvelle version.** Court, action-only.
Pour le détail technique (CI, updater, signing), voir
[`desktop-release-automation.md`](./desktop-release-automation.md).

---

## Principe — landing libre, web + desktop en lockstep

Trois surfaces, deux rythmes différents :

| Surface | Trigger | URL prod |
|---|---|---|
| **Landing** (`mozart.build`) | `git push origin main` (touche `apps/landing/**`) | Déploie tout de suite |
| **Web** (`app.mozart.build`) | Tag `v*` uniquement | Lockstep avec desktop |
| **Desktop** (GitHub Release + auto-updater) | Tag `v*` uniquement | Lockstep avec web |

Concrètement :

| Action | Conséquence |
|---|---|
| `git push origin main` avec changements landing | Deploy landing prod. PR previews créées si touche web. |
| `git tag v0.1.0-beta.2 && git push --tags` | Déclenche **web prod** + **desktop release** en parallèle, atomique. Le landing changelog est déjà en prod (étape précédente du runbook). |

Pourquoi cette asymétrie : le landing est du contenu marketing qui change souvent (blog, changelog narratif, fixes copy). Pas besoin de tagger pour publier un fix de typo. Web + desktop partagent les contrats d'auth et de protocole — ils doivent bouger ensemble.

---

## Étape 1 — Pré-vol (5 min)

```bash
git checkout main
git pull
git status                       # propre
pnpm nx run-many -t lint typecheck test --parallel=3
```

Vérifications manuelles :
- La preview du dernier push main fonctionne (`https://<sha>.mozart-web.pages.dev`)
- Tu as testé localement la feature principale qui justifie cette release
- Le `CHANGELOG.md` de la release précédente est cohérent (pour servir de modèle)

---

## Étape 2 — Bump version (1 min)

```bash
node tools/release-bump.mjs 0.1.0-beta.2
```

Ce script touche les 6 fichiers d'un coup :
- `apps/desktop-tauri/tauri.conf.json`
- `apps/desktop-tauri/Cargo.toml`
- `package.json`
- `CHANGELOG.md` (ajoute la section vide)
- `apps/landing/src/content/changelog/v0-1-0-beta-2.md` (crée le fichier vide)
- (le tag git, tu le crées toi à l'étape 4)

> Le script n'existe pas encore — il fait partie des TODOs §8 de
> `desktop-release-automation.md`. En attendant, édite les 5 fichiers à la main.

---

## Étape 3 — Écrire les changelogs (15-30 min)

Deux fichiers différents pour deux audiences :

**`CHANGELOG.md` (racine)** — pour les devs et la GitHub Release. Format
[Keep a Changelog](https://keepachangelog.com), bullet-points secs :

```markdown
## [0.1.0-beta.2] — 2026-06-15

### Added
- Workspace search via Cmd+P
- ...

### Fixed
- Sidebar collapses on window resize <1200px
- ...
```

**`apps/landing/src/content/changelog/v0-1-0-beta-2.md`** — pour les users
sur `mozart.build/changelog/v-0-1-0-beta-2`. Frontmatter + prose narrative
(prends modèle sur `v0-1-0-beta-1.md`) :

```markdown
---
version: '0.1.0-beta.2'
date: 2026-06-15
title: <titre court raconté>
---

<paragraphe d'intro qui dit pourquoi cette release existe>

### <section narrative>
- ...
```

---

## Étape 4 — Commit, tag, push (1 min)

```bash
git add -A
git commit -m "chore(release): v0.1.0-beta.2"
git tag v0.1.0-beta.2
git push origin main --tags
```

Le tag doit avoir le préfixe `v`. C'est ce qui déclenche `release.yml`.

---

## Étape 5 — Attendre la CI (~15 min)

Sur `https://github.com/t1m4lc/mozart/actions` tu dois voir deux workflows
se lancer en parallèle après le tag :

| Workflow | Quoi | Durée |
|---|---|---|
| **Deploy Web** | Déploie `app.mozart.build` (prod) | ~3 min |
| **Release Desktop** | Build macOS arm + intel, Windows, Linux. Signe avec ta clé updater. Crée la GitHub Release (en **draft**) | ~15 min |

**Deploy Landing** s'est déjà déclenché plus tôt — lors du `git push origin main`
de l'étape 4, dès que tu as commit le `apps/landing/src/content/changelog/v0-1-0-beta-2.md`.
La page `/changelog/v-0-1-0-beta-2` est donc déjà live au moment où tu publies
la GitHub Release.

---

## Étape 6 — Publier la GitHub Release (2 min)

1. `https://github.com/t1m4lc/mozart/releases`
2. Trouve le **draft** `v0.1.0-beta.2`
3. Vérifie que les 4 artefacts sont attachés :
   - `Mozart_0.1.0-beta.2_aarch64.dmg` (macOS arm)
   - `Mozart_0.1.0-beta.2_x64.dmg` (macOS intel)
   - `Mozart_0.1.0-beta.2_x64_en-US.msi` (Windows)
   - `mozart_0.1.0-beta.2_amd64.AppImage` (Linux)
4. Vérifie que `latest.json` est attaché
5. Colle le contenu du `CHANGELOG.md` (section concernée) dans la description
6. Décoche "Set as latest release" si c'est une beta et tu veux que `latest`
   pointe encore sur la dernière stable — sinon laisse coché
7. **Publish release**

À cet instant, `latest.json` devient accessible publiquement.
Toutes les apps installées qui démarrent ensuite proposeront l'update.

---

## Étape 7 — Smoke test (5 min)

- [ ] `https://app.mozart.build/login` → page Clerk visible
- [ ] `https://mozart.build/changelog/v-0-1-0-beta-2` → ta nouvelle page rendue
- [ ] Sur ta machine, ouvre l'ancienne version installée. Bouton "Update available — restart to install" doit apparaître dans les 30s (si l'app est restée ouverte 30s+ après le check de démarrage)
- [ ] Clique le bouton → l'app se relance sur la nouvelle version (vérif via menu Mozart → About)

Si le bouton n'apparaît pas : check les logs Tauri (`~/Library/Logs/build.mozart.desktop/`
ou équivalent OS) pour voir si l'updater a hit le bon endpoint.

---

## Étape 8 — Communication (optionnel)

À partir de beta.2, l'updater fait le travail. Tu n'as plus besoin d'envoyer un mail à chaque release.

Cas où communiquer reste utile :
- Breaking changes (config migration, re-login forcé, etc.) → mail aux beta-testers AVANT le tag
- Nouvelle feature majeure → tweet / post Linear / Discord avec lien `mozart.build/changelog/...`

---

## Cas particuliers

### Hotfix urgent (bug bloquant sur main)

Pas besoin de différer en attendant une release planifiée. Tag immédiatement
depuis main : `git tag v0.1.0-beta.2.1 && git push --tags`. Même flow.

### Annuler une release juste après le tag

Tant que la release est en **draft** sur GitHub, supprime-la via l'UI. Le
tag git reste mais aucun user ne sera notifié. Tu peux re-tag plus tard.

Si déjà **publiée** : tu ne peux pas la "défaire" pour les users qui ont déjà
update. Sors une beta.2.1 qui fix.

### Forcer un check d'update côté app (debug)

Pendant le dev, tu peux ajouter un menu item "Check for updates…" qui appelle
`check()` puis affiche le résultat. Utile quand tu veux tester l'updater sans
attendre le check au boot.

---

## La toute première release (`v0.1.0-beta.1`) — différences

Beta.1 sera la première à passer par ce process. Le **setup one-time**
(§8 de `desktop-release-automation.md`) est déjà fait :

1. ✅ Paire de clés updater générée
2. ✅ `TAURI_SIGNING_PRIVATE_KEY` dans GitHub Secrets
3. ✅ Plugin updater configuré (`tauri.conf.json` + `lib.rs` + Angular)
4. ✅ `tools/release-bump.mjs` créé
5. ✅ `.github/workflows/release.yml` créé
6. ✅ `deploy-web.yml` ne déploie qu'au tag (`deploy-landing.yml` reste sur main push)
7. ✅ `CHANGELOG.md` à la racine

Reste à faire avant d'envoyer beta.1 aux users :
- Dry-run du workflow release sur un tag de test (ex: `v0.1.0-beta.1-rc.1`) — vérifier que les 4 artefacts buildent et que la draft GitHub Release contient `latest.json`. Supprimer la draft, supprimer le tag local + remote, repartir propre.

Les beta.0 testers (sur Drive) devront télécharger manuellement la beta.1
depuis la GitHub Release — leur version Drive n'a pas l'updater. À partir
de beta.2, plus de manuel.
