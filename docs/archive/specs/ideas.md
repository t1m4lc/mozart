# Todo

- skill paperasse https://www.data.gouv.fr/reuses/paperasse-skills-ia-pour-la-comptabilite-et-fiscalite-francaise
- creer landing page reve avec plusieur corps de metier multilangue
- simplifier abstraire dev
- Token economy utiliser https://github.com/colbymchenry/codegraph
- on va defer la partie gestion des review dans l'app en invitant le user à poster une PR sur github.

- Comment faire en sorte que le user soit informer que sa branche main locale est à jour par rapport au remote ? comment mettre à jour les branche de workspace avec leur branche d'origine ?

- Question lié à celle du dessus comment voir son projet source projet de reference souvent (pas un worktree) souvent branche main par default? reflechir à UI et UX
- ajouter un context window component (70% yello, 90% red) manage windows count in chat.

-rendre run, config t terminal optional. pas utile pour les non dev. peut etre visible si .mozart/qqchose existe ?

- timeline moche à revoir
- revoir file view car header moche
  -scroll bug chat

- je trouve que l'ensemble du texte en general est un peu trop petit et les icon aussi peut tu faire des proposition pour rendre l'UI un peu plus accessible.

##

# Idée en vrac

Stratégy growth repos public skill classé par type de métier, et liste template repo gestion note privee...

Stratégy growth obligé d'etre referencé par qqn lien d'invitation avec code si growth scale (rate limited le lieu ou le code est mis 3 par heure)
avec stockage coté meta user clerk de l'id du user qui as reference si possible sans db autre que juste clerk de lier code parrainage à user ?

Ne pas reutiliser la roue il y a peut etre des chose existante comme genkit ou autre ? POur ne pas tous reinvente cote management d'agent.

---

- avoir dans l'UI un cercle count la part de contexte utilise par le llm avec changement de couleur si (60-70% de la fenêtre, la qualité dégrade) mettre en orange, puis 90% rouge. Avec tooltip qui explique.
- module domain metrics, pour calculer temps d'utilisation d'agent (par provider, model, projet), temps passé sur l'app , nombre de token consommé (par provider, model, projet), nombre de token economise grace à stratégies mozart...
- module token economy tous strategy pour reduite consommation de token
- module mémoire (bien plus tard) graph entity, embeding... ou connect à un service tiers
- module (integration mcp google drive...)
- barre de raccourci ou commande (cmd+p) recherche all workspace file ou (cmd+shift+p recherche command mozard) un peu comme vscode
- revoir le mode hors connexion (auto switch to local model notament)

UX improvement:

- possibilité dajouter des ligne en contexte en selectionnt puis clic droit avec menu contextuel, ajouter contexte au chat.
- raccourci clavier dans tous le file (avec kbt pour indiquer les raccourci) une page ou dialog qui permet de voir tableau mapping les raccourcis clavier -> action (lcture seul pour le moment) plus tard possiblitée de cusomiser et meme share customisation via .mozart/settings.json

- add info about effort prompt description
  low
  → petites modifs UI, CSS, rename, copy, fichiers simples
  medium
  → feature normale, composants, services, petite logique métier
  high
  → refactor multi-fichiers, bug subtil, architecture locale
  xhigh
  → grosse feature risquée, design technique, migrations, refactor profond
  max
  → audit complet, plan stratégique, problème très ambigu ou critique

En vitesse pure :
low > medium > high > xhigh > max

- keep info about chat model and effort with times... To add to metrics (and bind to telemetry)

## Open spec note — execution model + future orchestration module

PS: peut etre remplacer la notion de TASK en Session ?
car il semblerai que session soit se q
Avant de continuer sur la conception du module orchestartion module il faut faire l'état de l'art de l'exisatnt notament sur:

- https://code.claude.com/docs/en/sub-agents.md
- https://code.claude.com/docs/en/agent-teams.md
- https://code.claude.com/docs/en/costs.md (strategies to reduce cost)

Tension identifiée pendant le DX review et étendue depuis. **Non
résolue, à garder visible.** Aucune solution n'est arrêtée ; le but
est de ne pas re-découvrir le problème à la prochaine planification.

### Problèmes en tension

- **Coût du rechargement de contexte.** Aujourd'hui il n'y a pas de
  mémoire partagée entre chats d'agents. Un nouveau chat impose au
  minimum : relecture CLAUDE.md, re-exploration de la zone de code,
  re-parse de la section du plan. La Phase A (reconnaissance) est la
  partie la plus chère d'un atome ; la jeter entre deux atomes d'une
  même lane est coûteux en vitesse et en tokens.

- **"Un chat par atome" est sous-optimal à l'intérieur d'une lane.**
  Les atomes d'une même lane partagent zone de code, conventions et
  décisions micro. L'agent gagne à rester "chaud". La règle blanket
  d'un chat par atome gaspille la recon.

- **La parallélisation reste légitime, mais l'unité est la lane.**
  Des chats séparés se justifient quand deux séquences d'atomes
  peuvent vraiment tourner en parallèle — et à ce moment-là chaque
  chat vit naturellement dans son propre worktree. À l'intérieur
  d'une lane, séquentiel même-chat est le meilleur défaut.

- **Dépendances intra-lane vs cross-lane.** Certains atomes dépendent
  d'atomes de la même lane (B → C → D, flow same-chat naturel).
  D'autres dépendent d'atomes d'une lane différente (ex : un atome P2
  attend un atome P1). Le cas cross-lane pose une question : l'atome
  dépendant ouvre-t-il un fresh chat dans un fresh worktree une fois
  la dep mergée, ou branche-t-il depuis le worktree parent en héritant
  de son état ?

- **Topologie worktree impliquée.** Si chaque lane parallèle a son
  worktree et qu'un atome dépendant branche depuis le worktree parent
  d'une autre lane, le résultat est potentiellement un _arbre_ de
  worktrees, pas un fan-out plat. Ça impliquerait deux types
  d'intégration :
  (a) merges _internes à l'arbre_ pour faire avancer les atomes
  dépendants pendant que les lanes parentes continuent,
  (b) le merge _final_ de toutes les branches parallèles dans le
  worktree principal.

- **Sous-question produit pour Mozart lui-même.** Si Mozart doit
  orchestrer des agents qui exécutent des plans de ce genre, la
  topologie ci-dessus devient une feature produit, pas un détail
  d'exécution.

### Esquisse d'un module d'orchestration future (Mozart sur Mozart)

Vision exploratoire — pas une spec, point de départ pour la prochaine
planification ; à challenger.

#### Brique : moteur d'orchestration interne (pas une surface utilisateur)

Le découpage en wavelines et la délégation seraient pilotés par un
moteur d'orchestration interne à Mozart, **pas** par un fichier de
config exposé à l'utilisateur. C'est précisément la valeur produit —
la "secret sauce" — et l'exposer en config markdown casserait les
garanties de déterminisme et de robustesse que Mozart doit fournir :
un utilisateur qui tweake le découpage casse aussi la promesse.

En interne, ce moteur pourrait s'inspirer de la mécanique des skills
(description markdown + logique applicative séparée) pour rester
lisible et testable côté Mozart, mais il vit côté moteur, pas côté
projet utilisateur. Les `.mozart/plans/` restent eux écrivables et
lisibles par l'utilisateur (ce sont les plans produits par le moteur,
pas le moteur lui-même).

#### Flow master-agent → sub-agents

1. **Master ouvre un worktree dédié** avec branche.
2. **Phase 1 — planification fonctionnelle.** Le master rédige le
   plan, le fait challenger via une skill type `gstack`, puis l'écrit :
   - soit dans son propre worktree (vie courte, liée à l'exécution),
   - soit dans le repo sous `.mozart/plans/` si l'utilisateur veut
     intégrer le plan au projet (vie longue, versionné).
3. **Phase 2 — planification atomique.** Découpage en _wavelines_.
   Définition : une waveline est un ensemble d'atomes parallélisables
   au sein d'un même worktree et d'une même branche — pas de
   chevauchement de fichiers, pas de dépendance entre atomes de la
   waveline.
4. **Graphe de wavelines.** Certaines tournent en parallèle, d'autres
   en séquence à cause de dépendances entre elles (ex : waveline B
   ajoute une fonction au domaine X dont l'implémentation est faite
   en waveline A). Le chemin critique se calcule depuis ce graphe.
5. **Dispatch.** Chaque atome est lancé dans un prompt / chat dédié
   à un sous-agent. Sous condition d'optimisation token-economy,
   plusieurs atomes consécutifs d'une même waveline peuvent partager
   le même chat pour éviter de recharger le contexte — règle exacte
   à définir dans le moteur d'orchestration.
6. **Approve & review.** À la fin de chaque waveline, demande
   d'approbation et review utilisateur avant de débloquer les
   wavelines dépendantes.
7. **Reprise master + merge final.** Une fois toutes les wavelines
   terminées, le master reprend la main, lance une skill de gestion
   de conflits, puis merge les sous-worktrees des sous-agents dans
   son propre worktree.

#### Visualisation

Le graphe de wavelines serait rendu comme schéma de flow dans un
canvas, hébergé dans un onglet dédié du worktree de l'agent maître.

#### Invariant freeze

Le worktree de l'agent maître reste gelé tant que **tous** les sous-
agents ne sont pas en état done. Extension naturelle de P0.2
(workspace freeze) à un niveau d'orchestration supérieur : "freeze
pendant délégation".

#### Trade-off token-economy à arbitrer dans le moteur d'orchestration

Atome-par-chat (max parallélisme, max coût Phase A) vs atomes-
consécutifs-en-chat dans une waveline (chat warm, économie tokens,
parallélisme intra-waveline perdu). Heuristique pressentie : même
chat tant que les atomes partagent zone de code et conventions ;
nouveau chat dès qu'on change de zone ou que le contexte sature.

### Question ouverte — modèle de données

L'arrivée d'un master agent + sous-agents pose la question : la table
`tasks` (et l'entité Task plus généralement) garde-t-elle du sens ?

Constat brut : tout part désormais d'un worktree. Une "task", c'est
en pratique un worktree qui démarre avec un agent en mode
planification. Si c'est vrai, on peut proposer une simplification :
project (repo)
└── workspace (1 worktree, 1 branche)
├── subworkspaces: workspaceId[] ← vide si pas de délégation
└── ...

Règle implicite : si `subworkspaces` est non vide, ce workspace est
un **workspace maître**. Pas besoin d'un flag `isMaster` séparé ni
d'une table à part. Une convention de nommage sur les branches
(préfixe, chemin parent → enfant) permettrait de remonter
visuellement la hiérarchie sans requête.

À challenger — questions à creuser :

- Que devient l'historique d'exécution actuellement attaché à une
  Task ? (Probablement migrer sur `workspace` + `agent_runs` déjà
  existant.)
- Hiérarchie illimitée (workspace → sub → sub-sub) ou limitée à un
  seul niveau ? Les wavelines avec sous-dépendance pousseraient vers
  illimité, mais le coût UX d'un arbre profond est réel.
- Convention de nommage de branche : `master/feat-X`,
  `master/feat-X/sub-1`, `master/feat-X/sub-2` ? À arbitrer.
- Migration depuis l'existant `tasks` : `task → workspace` 1:1, ou
  certains états de Task n'ont plus d'équivalent ?

### Pricing — candidates pour un tier payant futur

Plusieurs briques de la vision orchestration ressemblent à des
features à forte valeur dont la version OSS / gratuite n'aurait pas
besoin d'office. À garder en tête au moment de découper le produit
en tiers, sans verrouiller dès maintenant la stratégie commerciale :

- **Token-economy / cost-aware dispatch.** Le moteur décide quand
  garder un chat warm vs en ouvrir un fresh ; valeur dépend du
  volume.
- **Intelligent routing.** Choix automatique du sous-agent / modèle
  en fonction du type d'atome (refacto Rust costaud → Sonnet 4.6 ;
  string-edit trivial → Haiku 4.5).
- **Auto settings.** Bascule automatique de modèle et d'effort selon
  signal (complexité estimée, retry après échec, longueur du chat,
  etc.).
- **Mémoire d'exécution partagée.** Carnet de contexte transmis
  entre sous-agents pour éviter la relecture Phase A à chaque fresh
  chat — ce qui résoudrait le premier point de "Problèmes en
  tension".
- **Limite du nombre de lanes parallèles.** Plafond doux côté
  gratuit, illimité côté payant — protection naturelle contre
  l'abus + valeur pour les power users.

Aucune de ces lignes n'est arrêtée. La règle est : **ne pas exposer
gratuitement dans l'OSS toutes les briques de la secret sauce avant
d'avoir décidé du modèle commercial**. Reporter le choix précis
freemium / paid-only / metered au moment du packaging produit, mais
ne pas se peindre dans un coin entre-temps en publiant la logique de
ces modules en clair.

### Pourquoi cette note n'est pas dans la spec dogfood

L'ensemble du sujet (rechargement de contexte, économie de tokens
chat-warm vs fresh-chat, topologie d'arbre de worktrees, auto-merge
inter-worktree, refonte modèle de données, packaging premium)
ressemble à un module futur dédié — appelons-le provisoirement
_orchestration-engine_ — plutôt qu'à un sujet à résoudre dans le
plan dogfood-readiness.

À re-visiter quand la phase dogfood aura produit des données réelles
sur l'endroit où le coût se loge effectivement (tokens ? latence ?
qualité des décisions ? friction merge ? confusion utilisateur ?).
