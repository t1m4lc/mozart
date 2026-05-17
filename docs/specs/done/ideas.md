# Todo

- etre sur que le llm est sandboxé (3 niveau de protection avec deux dernier niveau dismissable Mozart scope > Project scope > workspace scope )
- perf improvement idee de gestion du isrunning concernnat un llm dans un chat ustilisé à plusieur endroit créer un Set et poussé les chatId dedans quand llm load et remove quand fini pour savoir si ça load il suffit il suffira de verifier dedans. (pas de map ou filter ou de dispatch partout). peut etre créer un store dédié aux evenement loading ou autre ? ou laisser dans le store domain peut etre ?

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

# Idée en vrac

Stratégy growth repos public skill classé par type de métier, et liste template repo gestion note privee...

Stratégy growth obligé d'etre referencé par qqn lien d'invitation avec code si growth scale (rate limited le lieu ou le code est mis 3 par heure)
avec stockage coté meta user clerk de l'id du user qui as reference si possible sans db autre que juste clerk de lier code parrainage à user ?

REFLEXIONMULTI AGENT: réfléchir à la paralélisation multi aget les regles metier de MOZART le but c'est de faire en sorte de securisé peut etre utilise des lib pour ça comme genkit ou gencd je sais plus...un agent main pilotes le dispatch d'agents. Une fois un plan etablie avec idée donné à l'agent main qui créer un plan le met dans un fichier .mozart dédié dans le repo, le plan decouper en tache logique pour eviter conflit peut etre tache atomique pour commit apres chaque atome fait mais un agent d'un bloc de tache Epic effectue les tache sequentiellement jusqua la fin. L'agent main verifi chemin critique et les dependance en fonction il lance des agent en parallele sur des workspace dédié s'il sait qu'il va y avoir des conflit sur des fichier il peut créer des une copie du fichier en question meme au sein du worspace ceci permettra de simplifier la gestion des conflit potentiel en ayant un agent reviwer expert en gestion des conflit qui s'occupera de merger les brache de worspace ensemble. En effet il aura le contexte du plan initial et saura quel branche appartient à quel étape du plan et donc savoir quelle code est à prendre ou pas.

---

J'ai remarqué que en travaillant sur mon code j'ai trois approches une approche planification mais aussi discussion et une appoche execution. Peut etre qu'il serait bien d'ajouter un mode Ask qui ne serait pas en mode ajent c'est a dire lecture seul. Peut etre interessant pour juste poser des questions mais ce mode pourrai etre contextualiser à un workspace mais aussi sans. Si contextualiser, ça donne du contexte en regardant les fichier modifier par exemple. Sans contexte c'est plus large. Il pourrai aussi lié les chat à des prompt comme on a deja des workspace et autre. Il faudrai pouvoir enregistrer des chat aussi, pour les garder les ranger cci permettrai d'avoir des infos à porté de main. Peut etre qu'il est necessaire de créer un workspace dédié pour les chats (sans git peut etre ? je sais pas à creser)

- domain metrics, pour calculer temps d'utilisation d'agent (par provider, model, projet), temps passé sur l'app , nombre de token consommé (par provider, model, projet), nombre de token economise grace à stratégies mozart...

-manage pull request offline, sorte de PR en interne avec gestion de merge et conflit. Semi-remote. With lllm model in local you can do everyting locally withouinternet.

- We can add a chat section that show all the chat (some are from workspace and over not) we can chat without context embeded in a space but just in read in this case not an agent.
- And what append if the project has not git, do
  you automatically create a git repository ? It will be the best choice if not.
  - When add a repository, you need to create a worspace automaticaly.
    All in the middle of the shell , even right sidenav (but nothing now) is contextulize to the workspace. So the state need to keep this state
    We need to create empty state or error state for each part and no selected workspace state. and onboarding element nothing state.

- reflechir interface workflow de task, gestion de conflit
- créer un editeur de code lowcode (zen) pour ouvrir avec Mozart
- barre de raccourci ou commande
- gerer le cas envoi chat meme si pas connesion
- possibilité dajouter des ligne en contexte en selectionnt et ajouter contexte llm.

---