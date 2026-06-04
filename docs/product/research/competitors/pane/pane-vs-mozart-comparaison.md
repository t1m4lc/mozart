# Pane VS Mozart comparaison

Oui — **Pane est probablement le repo le plus proche de ton projet Mozart/Conductor-copycat** que tu m’aies montré jusqu’ici. Mais il n’est pas juste un clone de Conductor : il a un angle clair différent.

## Verdict rapide

**Pane = “terminal-first, cross-platform, agent-agnostic Conductor-like”**
**Mozart doit éviter d’être “Pane avec un autre nom”** et se différencier sur la **coordination intelligence layer** : planification, orchestration, review, mémoire de décision, synthèse multi-agents, pas seulement “lancer plusieurs agents dans des worktrees”.

Pane existe déjà, est open-source, cross-platform, et semble assez avancé : **Electron + React + TypeScript**, Windows/macOS/Linux, worktrees, diff viewer, browser intégré, terminal, file explorer, session persistence, support Claude Code/Codex/Aider/Goose ou tout CLI. ([GitHub][1])

---

# 1. Ce que Pane fait

Pane se présente comme :

> “Not an IDE. Not a terminal emulator. Vim for agent management.”

Son idée principale : **ne pas réinventer les agents**, mais leur donner une surface de travail. Si un agent tourne en terminal, il tourne dans Pane. ([GitHub][1])

Fonctionnalités clés :

| Zone         | Pane                                                  |
| ------------ | ----------------------------------------------------- |
| Plateformes  | Windows + macOS + Linux                               |
| Tech         | Electron, React, TypeScript, xterm.js                 |
| Agents       | Claude Code, Codex, Aider, Goose, tout CLI            |
| Isolation    | Git worktrees                                         |
| UX           | Panes + tabs                                          |
| Review       | Diff viewer intégré                                   |
| Productivité | Command palette, raccourcis clavier, terminal popover |
| Dev servers  | Browser tab intégré + ports isolés                    |
| Système      | Resource manager CPU/mémoire                          |
| Persistance  | Sessions persistées                                   |
| Licence      | AGPL-3.0 avec attribution visible à Dcouple Inc       |

Pane a aussi un argument marketing très fort : **Conductor est Mac-only, Pane vise Windows/Linux dès le départ**. Le README insiste explicitement sur “The Windows Problem” et positionne Pane comme outil pour “the other 75%”. ([GitHub][1])

---

# 2. Comparaison directe avec Mozart

## Mozart v0.1 tel que tu l’imaginais

D’après nos échanges, Mozart était plutôt :

| Axe                    | Mozart actuel                                                                 |
| ---------------------- | ----------------------------------------------------------------------------- |
| Inspiration            | Conductor                                                                     |
| Stack envisagée        | Nx monorepo, Angular, Tauri ou Electron/Nest sidecar selon les versions       |
| Objectif               | Gérer plusieurs agents IA en parallèle                                        |
| Agent runtime          | Claude/Mistral API ou Claude CLI selon scope                                  |
| Isolation              | Git worktrees                                                                 |
| UI                     | Sidebar projets/workspaces, chat agent, diffs, terminal                       |
| Différenciation future | Coordination intelligence layer                                               |
| Risque                 | Trop proche de Conductor/Pane si v0.1 = simple multi-agent worktree dashboard |

## Pane

| Axe                | Pane                                                           |
| ------------------ | -------------------------------------------------------------- |
| Inspiration        | Conductor + tmux + Superhuman                                  |
| Stack              | Electron + React + TS                                          |
| Objectif           | Manager des agents CLI dans des terminaux                      |
| Agent runtime      | CLI-first, agent-agnostic                                      |
| Isolation          | Worktrees automatiques                                         |
| UI                 | Panes + tabs + terminal + diff + explorer + browser            |
| Différenciation    | Cross-platform + keyboard-first + terminal-first               |
| Risque pour Mozart | Il occupe déjà la niche “Conductor cross-platform open-source” |

---

# 3. Le danger pour Mozart

Le danger n’est plus seulement “Conductor va sortir Windows/Linux”.

Le danger est maintenant :

> **Pane a déjà capturé le positionnement “Conductor, mais cross-platform et open-source”.**

Pane revendique explicitement :

* Windows/macOS/Linux ;
* tout agent CLI ;
* worktrees invisibles ;
* diff viewer ;
* workflow git complet ;
* persistance ;
* keyboard-first ;
* open-source. ([GitHub][1])

Donc si Mozart v0.1 = “Conductor-like open-source cross-platform avec agents parallèles + worktrees + diff”, tu arrives **après Pane**.

Ce n’est pas forcément mort, mais le positionnement doit changer.

---

# 4. Ce que Pane fait mieux que ton plan actuel

## 1. Il a une wedge produit très claire

Pane dit en une phrase :

> “You bring the agents. We make them fly.”

C’est simple : **agent client**, pas agent provider.

Mozart aujourd’hui hésite encore entre :

* Conductor copycat ;
* orchestration multi-agents ;
* coordination intelligence ;
* IDE/chat/diff dashboard ;
* branding musical.

Il faut réduire Mozart à une phrase aussi claire.

Exemple possible :

> **Mozart is the coordination layer for AI coding agents: plan, split, run, compare, review, and merge.**

Là, tu n’es plus seulement un gestionnaire de terminaux.

## 2. Pane a choisi le terminal comme intégration universelle

C’est malin. Au lieu d’intégrer chaque agent via API/SDK, Pane dit : “si ça tourne dans un terminal, ça marche”. Cela réduit énormément le coût d’intégration.

Dans son architecture, l’ajout d’un agent CLI passe par un `AbstractCliManager`, un registry, un panel React, et quelques types partagés. ([GitHub][2])

Pour Mozart, ça remet en question ton idée initiale d’utiliser directement les APIs Claude/Mistral en v0.1. Le CLI-first est probablement plus rapide à shipper.

## 3. Pane a déjà beaucoup de “petits détails UX”

Pane a des features très concrètes :

* `@mention` entre terminaux ;
* clipboard shortcuts ;
* terminal popover ;
* browser intégré ;
* resource manager ;
* status dots ;
* jump/refresh ;
* auto-copy `.env` ;
* ports isolés ;
* drag and drop. ([GitHub][1])

Ces features sont petites mais donnent une impression de produit mature.

---

# 5. Ce que Pane ne semble pas faire encore

C’est ici que Mozart peut gagner.

Pane gère surtout **l’exécution et l’environnement**. Il ne semble pas être une vraie couche de coordination intelligente.

Différence :

| Besoin                                | Pane        | Opportunité Mozart |
| ------------------------------------- | ----------- | ------------------ |
| Lancer plusieurs agents               | Oui         | Pas différenciant  |
| Créer worktrees                       | Oui         | Pas différenciant  |
| Voir diffs                            | Oui         | Pas différenciant  |
| Terminal agent-agnostic               | Oui         | Pas différenciant  |
| Planifier les tâches atomiques        | Pas le cœur | Très différenciant |
| Comparer plusieurs solutions d’agents | Pas clair   | Très différenciant |
| Détecter conflits entre agents        | Pas clair   | Très différenciant |
| Faire un review CEO/Eng/Design/DX     | Non         | Très différenciant |
| Mémoire de décisions projet           | Pas le cœur | Très différenciant |
| Score de confiance par agent/run      | Non         | Très différenciant |
| Fusion assistée avec raisonnement     | Pas clair   | Très différenciant |
| “Agent PM” qui pilote les autres      | Non         | Très différenciant |

Donc ton pivot “coordination intelligence layer” devient encore plus important.

---

# 6. Licence : attention si tu veux réutiliser le code

Pane est sous **AGPL-3.0**, avec une exigence d’attribution visible à Dcouple Inc dans l’UI. ([GitHub][3])

Conséquence pratique :

* Tu peux lire le code pour apprendre.
* Tu peux t’en inspirer conceptuellement.
* Mais si tu copies ou dérives substantiellement du code, ton app risque de devoir être AGPL aussi.
* Si Mozart doit devenir un produit commercial fermé, **ne copie pas le code de Pane**.

Pour Mozart, je recommanderais : **clean-room inspiration uniquement**. Tu regardes les features, l’architecture générale, les décisions produit, mais tu ne reprends pas de fichiers, composants, styles, textes marketing ou logique exacte.

---

# 7. Recommandation stratégique pour Mozart

## Ne fais pas ça

> “Mozart = Pane/Conductor mais en Angular/Tauri avec un meilleur design.”

Trop faible. Pane couvre déjà beaucoup.

## Fais plutôt ça

> **Mozart = coordination OS for AI coding work.**

Le produit ne doit pas être centré sur le terminal. Il doit être centré sur la **décision**.

### Nouvelle hiérarchie produit conseillée

**v0.1 — Coordination layer minimal**

* Import repo.
* Créer un objectif.
* Découper en tâches atomiques.
* Lancer 2-4 agents en worktrees.
* Chaque agent produit : résumé, diff, risques, tests, décision proposée.
* Mozart compare les outputs.
* Mozart recommande : merge A, merge B, combine A+B, reject.
* Human valide.

**v0.2 — Intelligence**

* Score de confiance par run.
* Détection de conflits.
* Agent reviewer.
* Historique des décisions.
* “Why this change?” sur chaque diff.
* Génération automatique de PR narrative.

**v0.3 — Team layer**

* Templates de workflows.
* Rôles : CEO review, Eng review, Design review, DX review.
* Memory projet.
* Dashboard d’avancement multi-agents.

---

# 8. Impact sur ton scope technique

Je changerais ton plan comme ça :

## Avant

* Desktop app style Conductor
* Worktrees
* Agents parallèles
* Chat
* Diff viewer
* Terminal
* GitHub Releases

## Après analyse de Pane

* Desktop app oui, mais **pas terminal-first comme cœur produit**
* Worktrees = infrastructure invisible
* Agents parallèles = commodity
* Diff viewer = nécessaire mais non différenciant
* La home screen doit être un **coordination cockpit**, pas une liste de terminaux
* Le premier écran doit répondre à :

  * “Quels agents travaillent ?”
  * “Sur quoi ?”
  * “Qui est bloqué ?”
  * “Quelle solution est meilleure ?”
  * “Qu’est-ce que je dois décider maintenant ?”

---

# 9. Positionnement recommandé

Je te proposerais ce positionnement :

> **Mozart is not another AI terminal manager. It is the conductor layer above AI coding agents. It plans the work, launches agents in isolated worktrees, compares their outputs, reviews tradeoffs, and helps you merge the best result.**

En français :

> **Mozart n’est pas un gestionnaire de terminaux IA. C’est la couche de coordination au-dessus des agents de code : il découpe le travail, lance les agents, compare leurs résultats, explique les compromis et aide à merger la meilleure solution.**

Ça te sort de la bataille frontale avec Pane.

---

# 10. Décision concrète

Ma recommandation :

**Ne pivote pas vers “Pane clone”. Pivot léger vers “coordination intelligence layer dès v0.1”.**

Garde de Pane :

* cross-platform comme exigence ;
* agent-agnostic à terme ;
* worktrees invisibles ;
* status dots ;
* ports isolés ;
* auto-copy `.env` ;
* browser preview ;
* command palette.

Ne copie pas :

* terminal-first comme promesse principale ;
* “panes/tabs” comme modèle mental central ;
* wording marketing ;
* code AGPL ;
* UI trop proche.

Ton wedge doit être :

> **Pane manages where agents run. Mozart manages what agents should do and which result to trust.**

[1]: https://raw.githubusercontent.com/dcouple/Pane/main/README.md "raw.githubusercontent.com"
[2]: https://raw.githubusercontent.com/dcouple/Pane/main/docs/ADDING_NEW_CLI_TOOLS.md "raw.githubusercontent.com"
[3]: https://raw.githubusercontent.com/dcouple/Pane/main/LICENSE "raw.githubusercontent.com"
