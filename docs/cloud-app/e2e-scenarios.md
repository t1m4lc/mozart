# Scénarios E2E — validation beta

4 parcours à valider de bout en bout avant (et après) une release beta.

---

## Scénario A — Partage du fichier de build

**Prérequis :** dossier Google Drive `Mozart Beta — vX.X.X` créé avec les artefacts.

| Étape | Action | Critère |
|---|---|---|
| 1 | Ouvrir le lien Google Drive partagé | Dossier accessible (ou demande d'accès envoyée) |
| 2 | Télécharger l'installateur pour sa plateforme | Téléchargement démarre, pas d'erreur 403 |
| 3 | Vérifier la taille du fichier | Entre 50 MB et 150 MB selon la plateforme |

---

## Scénario B — Installation desktop

### macOS

| Étape | Action | Critère |
|---|---|---|
| 1 | Double-clic sur `Mozart_x.x.x_aarch64.dmg` (ou `x64`) | Fenêtre DMG s'ouvre |
| 2 | Glisser Mozart dans le dossier Applications | Copie réussie |
| 3 | Lancer Mozart depuis Applications | Fenêtre principale s'ouvre (1400×900) |
| 4 | Si blocage Gatekeeper : Préférences Système → Confidentialité → Ouvrir quand même | App se lance |

### Windows

| Étape | Action | Critère |
|---|---|---|
| 1 | Exécuter `Mozart_x.x.x_x64-setup.msi` | Assistant d'installation démarre |
| 2 | Suivre l'assistant (Next → Install → Finish) | Installation sans erreur |
| 3 | Lancer Mozart depuis le menu Démarrer | Fenêtre principale s'ouvre |

### Linux

| Étape | Action | Critère |
|---|---|---|
| 1 | `chmod +x Mozart_x.x.x_amd64.AppImage` | — |
| 2 | `./Mozart_x.x.x_amd64.AppImage` | Fenêtre principale s'ouvre |

---

## Scénario C — Connexion web

**URL :** `https://app.mozart.build`

| Étape | Action | Critère |
|---|---|---|
| 1 | Ouvrir `https://app.mozart.build` dans un navigateur | Page `/login` chargée, pas de 404 |
| 2 | Cliquer "Sign in with GitHub" | Redirection vers GitHub OAuth |
| 3 | Autoriser Mozart sur GitHub | Redirection vers `/auth-callback` |
| 4 | Attendre la redirection | Atterrit sur `/dashboard` sans erreur |
| 5 | Ouvrir la console JS (F12) | Aucune erreur rouge |
| 6 | Rafraîchir la page sur `/dashboard` | Page se recharge (pas de 404 — `_redirects` SPA) |

---

## Scénario D — Utilisation desktop

**Prérequis :** app desktop installée (scénario B), compte créé via le web (scénario C).

| Étape | Action | Critère |
|---|---|---|
| 1 | Ouvrir l'app Mozart desktop | Écran de bienvenue ou fenêtre de connexion |
| 2 | Cliquer "Se connecter" | Navigateur système s'ouvre sur Clerk |
| 3 | Finaliser l'auth Clerk | Retour sur l'app desktop via deep-link `mozart://` |
| 4 | Créer un projet | Dialogue / formulaire de création, projet apparaît dans la sidebar |
| 5 | Ouvrir un workspace | Workspace chargé, composer visible |
| 6 | Envoyer un message à l'agent | Réponse reçue en streaming, timeline mise à jour |
| 7 | Pas de crash pendant 2 min d'utilisation normale | Aucun crash Tauri |

---

## Smoke tests rapides (post-deploy)

À faire après chaque déploiement de `app.mozart.build` :

```bash
# 200 sur la page de login
curl -sI https://app.mozart.build/login | head -1

# robots.txt bloque tout
curl -s https://app.mozart.build/robots.txt
# attendu : "Disallow: /"

# noindex dans le HTML
curl -s https://app.mozart.build/ | grep -i noindex

# API non-auth → 401
curl -si https://app.mozart.build/api/github/oauth-token | head -1

# SPA fallback — route profonde ne retourne pas 404
curl -sI https://app.mozart.build/dashboard | head -1
```
