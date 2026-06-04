Voici tes notes structurées en version claire :

## Conductor — notes UI / produit

### Structure globale

L’app est organisée en **3 colonnes principales** :

1. **Left sidebar**
2. **Main workspace / chat**
3. **Right sidebar / files / terminal**

---

## 1. Left sidebar

### Top bar

En haut de la sidebar :

* bouton toggle sidebar
* bouton go backward
* bouton go forward
* grande zone “History” sur toute la largeur

### Section Projects

La section **Projects** contient :

* filtres
* bouton add repository
* liste des repositories/projets
* chaque projet est un toggle ouvrable

Pour chaque projet, on voit :

* nom du projet, exemple : `quick-start`
* nombre de workspaces associés
* bouton repo settings
* bouton create

Le bouton **create** semble permettre de créer un workspace à partir de :

* pull request
* branche
* issue

Quand on clique dessus, ça ouvre une command dialog avec search.

### Workspaces

Sous chaque projet :

* liste des workspaces
* au hover : bouton archive
* clic droit :

  * mark as unread
  * pin
  * changer le status :

    * backlog
    * in progress
    * review
    * done
    * cancelled
  * rename directory
  * archive

Quand on clique sur un workspace, il se charge dans la colonne centrale.

### Bottom sidebar

Tout en bas :

* settings
* help

---

## 2. Colonne centrale

### Top bar / breadcrumb

En haut :

* breadcrumb du projet :

  * `quick-start`
  * flèche
  * nom du workspace
* icône du projet
* menu trois points

On voit aussi :

* target branch : `origin/main`
* bouton `Open`

  * ouvrir dans Finder
  * ouvrir dans un IDE
  * copy path
* bouton toggle right sidebar

### Tabs

Sous la top bar :

* système de tabs
* on peut :

  * renommer une tab
  * fermer une tab
  * ouvrir une nouvelle tab

Une tab semble correspondre à une **conversation / agent** dans le même workspace.

À creuser : possibilité d’avoir plusieurs agents parallèles dans un même workspace.

### Chat

Au centre :

* conversation avec l’agent
* historique des actions / messages

### Composer

En bas :

* textarea
* menu change model
* adjust effort level
* modes :

  * mode normal
  * autre mode plus complet / plan ?
* attachments
* links
* issues
* possibilité de linker :

  * GitHub issue
  * Linear issue
  * workspace

---

## 3. Right sidebar

### Top nav

En haut :

* raccourci vers GitHub
* probablement accès rapide au repo / PR

### Section fichiers

Tabs ou filtres :

* all files
* changed
* checks

Actions :

* select working directory
* open file picker

Sur les boutons :

* tooltip au hover
* raccourci clavier affiché

La zone affiche une liste scrollable de fichiers.

### Section run / terminal

En dessous, section repliable.

Elle contient :

* setup
* run
* terminal

La partie **run** permet de lancer le workspace et de voir ce qui se passe en direct, comme un terminal intégré.

Actions possibles :

* start run
* stop run
* voir les logs
* ouvrir terminal
* ajouter plusieurs terminaux

---

## Résumé produit

Conductor ressemble à un **IDE pour agents de code**, organisé autour de :

* repositories
* workspaces isolés
* conversations / agents par tab
* gestion GitHub / PR / issues
* fichiers modifiés
* checks
* terminal intégré
* exécution du projet directement dans l’app

L’idée principale : pouvoir gérer plusieurs workspaces et agents de code en parallèle, avec une interface proche d’un mix entre GitHub Desktop, Cursor, Claude Code et un IDE.
