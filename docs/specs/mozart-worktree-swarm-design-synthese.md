# MOZART — Synthèse fonctionnelle du design Workspaces / Agents parallèles / Swarm

## Objectif du document

Ce document sert de contexte produit pour un agent chargé d’implémenter MOZART v0.0.1 et ses évolutions futures.

MOZART est un outil de coordination pour agents de code. Il ne doit pas être pensé comme un simple terminal manager ou une copie de Conductor. Son objectif est de permettre à un utilisateur de lancer plusieurs agents en parallèle, de suivre leur travail, de comparer leurs résultats, puis de décider quelle solution merger.

La primitive technique sous-jacente peut être Git worktree, mais le concept visible pour l’utilisateur doit rester fonctionnel : workspace, tâche, solution candidate, review, merge decision.

---

## Vision courte

**MOZART est la couche de coordination au-dessus des agents de code.**

Il permet de :

1. créer une tâche de développement ;
2. lancer un ou plusieurs agents en parallèle ;
3. isoler chaque agent dans son propre workspace ;
4. observer leur progression ;
5. comparer leurs changements ;
6. identifier les risques et conflits ;
7. recommander ou aider à choisir la meilleure solution ;
8. merger ou archiver proprement le résultat.

Phrase à garder :

> Worktrees let agents work in parallel. MOZART decides how their work should combine.

---

## Inspirations principales

### 1. Conductor

Conductor inspire le modèle “équipe d’agents de code”. Son positionnement public est de créer des agents Claude Code / Codex en parallèle dans des workspaces isolés, de voir leur travail, puis de review et merger les changements.

Inspiration à garder :

- agents parallèles ;
- workspaces isolés ;
- vue d’ensemble des agents ;
- review des changements ;
- merge / PR comme étape finale ;
- interface orientée “team of coding agents”.

À ne pas copier directement :

- wording marketing ;
- layout exact ;
- flows visuels trop spécifiques ;
- dépendance Mac-only comme positionnement.

Sources :

- https://conductor.build/
- https://www.conductor.build/docs
- https://www.conductor.build/changelog

### 2. Pane

Pane inspire la partie “workspace isolé par agent” et le côté agent-agnostic. Pane se présente comme un manager terminal-first pour agents IA : si un agent tourne dans un terminal, il peut tourner dans Pane. Il utilise l’idée de panes/sessions associés à des worktrees, avec diff viewer, browser, file explorer et terminal.

Inspiration à garder :

- workspace/worktree invisible pour l’utilisateur ;
- un environnement isolé par session ou agent ;
- intégration CLI-first possible ;
- terminal + diff + explorer + browser attachés à un workspace ;
- agent-agnostic : Claude Code, Codex, Aider, Goose, etc. ;
- nettoyage/archivage propre des sessions.

À ne pas copier directement :

- code source, car Pane est sous AGPL-3.0 ;
- structure exacte des services ;
- UI terminal-first comme promesse principale ;
- wording “pane” ou “vim for agent management”.

Source :

- https://github.com/dcouple/Pane

### 3. Outils worktree / tmux / agent managers

Il existe aussi plusieurs outils proches autour de Git worktree, tmux et agents IA. Ils confirment que l’isolation par worktree est une bonne primitive pour exécuter plusieurs agents en parallèle.

Inspiration à garder :

- un agent = un workspace isolé ;
- chaque workspace peut être lié à une branche ;
- les agents peuvent travailler simultanément ;
- les changements ne sont mergés qu’après vérification ;
- l’utilisateur doit voir clairement ce qui est running, blocked, done ou failed.

Sources :

- https://github.com/agenttools/worktree
- https://github.com/coplane/par
- https://github.com/morapelker/hive

---

## Différenciation MOZART

MOZART ne doit pas être seulement :

> “Conductor open-source” ou “Pane avec une autre UI”.

MOZART doit être :

> **un cockpit de coordination et de décision pour agents de code.**

La différence principale :

- Pane gère surtout où les agents tournent.
- Conductor gère l’exécution parallèle et le merge.
- MOZART doit gérer ce que les agents doivent faire, comment comparer leurs résultats, et quelle solution mérite confiance.

La valeur de MOZART est donc dans la coordination :

```text
Plan → Split → Run → Observe → Compare → Review → Merge
```

---

## Concepts fonctionnels

### Project

Un projet correspond à un repository local.

Il contient :

- un chemin local ;
- une branche de base ;
- une liste de tâches ;
- des workspaces générés par MOZART ;
- l’historique des runs et décisions.

### Task

Une tâche est un objectif donné par l’utilisateur.

Exemples :

- “Ajouter GitHub OAuth” ;
- “Réparer le bug de build Windows” ;
- “Créer la landing page v0” ;
- “Refactorer la gestion des settings”.

Une task peut produire un seul workspace ou plusieurs solutions candidates.

### Workspace

Un workspace est un espace de travail isolé pour un agent ou une solution candidate.

L’utilisateur ne doit pas avoir besoin de comprendre Git worktree. Il voit simplement :

- Workspace A ;
- Workspace B ;
- Workspace C ;
- Reviewer workspace ;
- Tester workspace.

Chaque workspace contient :

- un agent ou une session ;
- des fichiers modifiés ;
- un diff ;
- des logs ;
- un état d’avancement ;
- éventuellement un navigateur local ou terminal.

### Agent Run

Un agent run est une exécution concrète d’un agent dans un workspace.

Il peut être :

- builder ;
- reviewer ;
- tester ;
- planner ;
- designer ;
- refactor agent.

Dans v0.0.1, le plus simple est de commencer par des agents builders indépendants.

### Candidate Solution

Une solution candidate est le résultat d’un agent ou d’un workspace.

Elle doit être comparée aux autres sur :

- fichiers modifiés ;
- taille du diff ;
- clarté ;
- risques ;
- tests ;
- qualité perçue ;
- conflits potentiels ;
- facilité à merger.

### Review

La review est la couche qui transforme plusieurs outputs bruts en décision lisible.

Elle doit répondre à :

- qu’a fait chaque agent ?
- quels fichiers ont été touchés ?
- quelle solution est la plus simple ?
- quelle solution est la plus risquée ?
- les solutions peuvent-elles être combinées ?
- que faut-il merger, rejeter ou retravailler ?

### Merge Decision

La décision finale peut être :

- merge solution A ;
- merge solution B ;
- combine A + B ;
- ask agent to revise ;
- archive all ;
- create PR ;
- keep as draft.

---

## Approche v0.0.1

La v0.0.1 doit rester simple. Elle doit prouver que MOZART peut lancer et gérer des agents en parallèle sans devenir un produit trop complexe.

### Scope recommandé v0.0.1

1. Ajouter un projet local.
2. Créer une task.
3. Créer un workspace isolé par agent.
4. Lancer un agent CLI dans chaque workspace.
5. Afficher l’état de chaque agent : idle, running, waiting, done, failed.
6. Afficher les logs ou le terminal de chaque agent.
7. Afficher le diff de chaque workspace.
8. Permettre d’archiver/supprimer un workspace.
9. Permettre un merge manuel ou semi-assisté.
10. Créer une synthèse simple de chaque run.

### Ce qui doit être visible dans l’UI

L’utilisateur doit voir :

- la task en cours ;
- les agents lancés ;
- leur état ;
- leur workspace ;
- les fichiers changés ;
- un résumé de ce qu’ils ont fait ;
- les actions disponibles : open, stop, review, archive, merge.

### Ce qui doit rester invisible

L’utilisateur ne doit pas gérer directement :

- `git worktree add` ;
- `git worktree remove` ;
- les chemins internes ;
- les branches techniques ;
- les locks ;
- les détails d’implémentation Git.

---

## Approche v0.1+

Après v0.0.1, MOZART peut ajouter progressivement la coordination intelligente.

### v0.1 — Parallel Candidates

Objectif : plusieurs agents produisent plusieurs solutions candidates pour une même tâche.

Fonctionnalités :

- lancer 2 à 4 agents sur une même tâche ;
- comparer les diffs ;
- générer une synthèse par solution ;
- classer les solutions ;
- recommander une solution à merger ;
- signaler les conflits évidents.

### v0.2 — Role-based Agents

Objectif : les agents ne font pas tous la même chose.

Rôles possibles :

- Planner : découpe la tâche ;
- Builder : implémente ;
- Tester : vérifie ou ajoute des tests ;
- Reviewer : critique le diff ;
- Designer : vérifie l’UX/UI ;
- DX Reviewer : vérifie lisibilité, structure, maintenabilité.

Flow :

```text
User Task
  → Planner
  → Builder Workspace(s)
  → Tester Workspace
  → Reviewer
  → Merge Decision
```

### v0.3 — Swarm Coordination

Objectif : les agents collaborent vraiment.

Le système peut :

- envoyer le résultat d’un agent à un autre ;
- demander à un reviewer de critiquer plusieurs solutions ;
- demander à un builder de corriger selon la review ;
- arrêter les runs inutiles ;
- détecter les conflits entre agents ;
- proposer une stratégie de merge ;
- garder une mémoire des décisions.

Important : ne pas commencer par là. Le vrai swarm doit venir après la validation du modèle simple “parallel candidates”.

---

## Règles produit importantes

### 1. Worktree is implementation, workspace is product

Ne jamais centrer l’UX sur Git worktree.

Bon vocabulaire :

- workspace ;
- candidate ;
- run ;
- review ;
- merge decision.

Vocabulaire à éviter dans l’UI principale :

- worktree ;
- detached HEAD ;
- git internals ;
- branch plumbing.

### 2. Parallel does not mean swarm

Plusieurs agents en parallèle ne font pas encore un swarm.

La progression logique est :

```text
Parallel execution → Role-based execution → Coordinated swarm
```

### 3. The coordinator is the product

La valeur de MOZART n’est pas seulement de lancer des agents.

La valeur est de répondre à :

- qui travaille sur quoi ?
- qui est bloqué ?
- quelle solution est meilleure ?
- quels changements sont risqués ?
- quelles solutions peuvent être combinées ?
- qu’est-ce que l’utilisateur doit décider maintenant ?

### 4. Every run should produce a summary

Chaque agent doit produire ou être résumé avec :

- ce qui a été fait ;
- fichiers touchés ;
- tests lancés ;
- risques ;
- prochaines actions ;
- niveau de confiance.

### 5. Merge is a decision, not just a button

Le merge doit être présenté comme une décision produit :

- pourquoi cette solution ?
- quels risques ?
- quels fichiers changent ?
- est-ce testé ?
- est-ce réversible ?

---

## États fonctionnels recommandés

### Task statuses

```text
created
planning
running
reviewing
ready_to_merge
merged
archived
failed
```

### Workspace statuses

```text
created
running
waiting_for_input
changed
done
failed
archived
merged
```

### Agent statuses

```text
idle
starting
running
waiting
completed
failed
stopped
```

---

## UI fonctionnelle recommandée

### Sidebar

Contient :

- liste des projets ;
- liste des tasks ;
- workspaces actifs ;
- états rapides : running, waiting, done, failed.

### Main area

Contient la task active :

- objectif ;
- agents lancés ;
- cards de solutions candidates ;
- résumé de chaque agent ;
- actions rapides.

### Right panel

Contient la review :

- fichiers modifiés ;
- diff ;
- risques ;
- tests ;
- recommandation ;
- merge actions.

### Bottom / Terminal area

Contient :

- logs agent ;
- terminal optionnel ;
- commandes exécutées ;
- erreurs.

---

## Non-goals v0.0.1

Ne pas essayer de faire trop tôt :

- swarm complet ;
- chat inter-agents complexe ;
- auto-merge agressif ;
- marketplace d’agents ;
- intégration profonde GitHub complète ;
- memory long-terme sophistiquée ;
- permissions enterprise ;
- scoring avancé ;
- orchestration autonome sans humain.

---

## Résultat attendu de la v0.0.1

À la fin de v0.0.1, l’utilisateur doit pouvoir faire :

```text
1. Ouvrir un repo local.
2. Créer une tâche.
3. Lancer deux agents en parallèle.
4. Voir chaque agent travailler dans son propre workspace.
5. Voir les fichiers modifiés par chaque agent.
6. Lire un résumé simple du résultat.
7. Ouvrir le diff.
8. Choisir quoi garder.
9. Archiver ou merger.
```

Si cette boucle fonctionne, MOZART a une base solide pour devenir une vraie couche de coordination multi-agents.

---

## Résumé final pour l’agent implémenteur

Implémente MOZART comme un cockpit fonctionnel pour agents de code parallèles.

Le modèle central est :

```text
Project → Task → Workspace(s) → Agent Run(s) → Candidate Solution(s) → Review → Merge Decision
```

Utilise des workspaces isolés pour éviter que les agents se marchent dessus. L’utilisateur ne doit pas gérer Git worktree directement. Chaque agent doit travailler dans un environnement séparé, produire un diff observable, puis être comparé aux autres.

La v0.0.1 doit rester simple : créer des tasks, lancer des agents dans des workspaces isolés, afficher leur état, voir les diffs, résumer les résultats, archiver ou merger.

Prépare le système pour plus tard, mais ne construis pas encore un swarm complet.

La direction long-terme est claire : MOZART doit devenir la couche qui planifie, observe, compare, arbitre et aide à combiner le travail de plusieurs agents.