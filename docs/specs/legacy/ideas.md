# Todo

- etre sur que le llm est sandboxé (3 niveau de protection avec deux dernier niveau dismissable Mozart scope > Project scope > workspace scope )
- perf improvement idee de gestion du isrunning concernnat un llm dans un chat ustilisé à plusieur endroit créer un Set et poussé les chatId dedans quand llm load et remove quand fini pour savoir si ça load il suffit il suffira de verifier dedans. (pas de map ou filter ou de dispatch partout). peut etre créer un store dédié aux evenement loading ou autre ? ou laisser dans le store domain peut etre ?

- add info about effort prompt
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

Donc en vitesse pure :
low > medium > high > xhigh > max

- keep info about chat model and effort with times... To add to metrics (and bind to telemetry)

# Idée en vrac

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

Q1.1 le flow est le suivant, (A noter dans les specs) si non authentifié dans app desktop route vers la page welcome seul page accessible dans desktop sans authentification. (page avec logo mozart en gros centre top et message sign in to continue qui ouvre l'app browser app.mozart.build (app web dans nx) ici deux options si auth dans web alors page /dashboard avec un message du type happy to see you again "Name" et un bouton "Launch Mozart desktop" qui route vers mozart://auth?token=sometoken, sinon /login avec centré logo mozart , Start Composing title et deux bouton connect with github ou google. La page dans desktop apres click il y a le bouton signin qui as opening browser et sous une petite phrase "Finish sign in in the browser window."
Q1.2 non app bloqué sans auth (par contre un user dejà auth token valide et sans internet aura accées à l'app en hors lign et fonctionnera s'il a un model llm local, mais auth soit token valide necessaire)
Q1.3 En effet etape importe et surtout limiter au plus les frictions et etre fun. apres Auth comme indiqué en Q1.1 une fois que le deep link à redirigé vers l'app desktop mozart; page /welcome si user onboarding = true sinon page /onboarding pour configurer l'app

- Vérification Git installé (si non → instructions install par OS, on attend) Required
- Vérification + setup des provider llm au moins un (on a dejà implementé Claude Code (claude code login ou clé api fallback) car pas encore d'autre provider mais à prévoir possibilité de choisir parmis la liste pour en set au moins un.
- Connexion GitHub (OAuth via Clerk) optionel car sinon pas possibilité d'envoyer des pr ou de get projet via github et tout autre feature possible avec github dans l'app.
- Redirige vers le features tour page /tour qui est skippable.

Q1.4 je dirai Différé à v0.0.2 et comme indiqué optional en onboarding et justintime required pour Crréer une pR.
Q1.5 c'est l'exécutable local que Mozart spawn (déjà implémenté actuellement avec adapter Tauri)

Bloc 1
Oui et n'oubli pas les specs du projet /web et corresction ici: Après deep-link retour desktop : /​ qui est le dashboard avec rien d'ouvert (aucun projet ou workspace selectionné)

Bloc 2
Q2.1 Oui option C avec en avec en plus une initialisation du workspace (propblement un npm install je sais pas dépend du repo peut etre ? seulement si package.json ou autre identifié).

Q2.3 d) on va faire génération auto avec adjectif-music artist name and sequencial number to avoid conflict

Q2.4 oui {github-username}/{workspace-name} par default si non connecté à github mozart/{workspace-name}

Q2.5 oui (a)

Q.6 Important note dans specs: Un dialog qui explique que Mozart va run git init pour créer un repository (si connecté à github ajouter ert créer un repository github privée addd it as origin and push to the main branch)
deux champ texte Owner (avec nom github) si github connecté
Repository name (nom du folder qu'on veux importé par default)
Et sous en info will create ownername/reponame (check on githubname is available)
Boutons cancel et "initialize the project"

Q2.7 (b)

Finalement concernant bloc d'avnt, workspace nom sera juste nom artiste entier ex bob-marlet et 1, 2, sans les 00
Q3.1 presque (d) Vide (juste la sidebar à gauche, middle 2 clickable 3 cards in one line avec
a) open project: open file browser  
b) Open github project: open dialog with title: "Clone Github repo" angular signa form with 2 input repository url and location by default on ubuntu "/Users/name/mozart/repos et un bouton Browse à coté (grouped input spartan ui) pour changer de location si besoin. et bouton clone repo avec shortcut enter.
c) Quick start: dialog avec titre "Create a project" subtitle "Create a local folder, private Github repo, and first workspace". 3 inputs One input text project name. parent folder and browse button. And Radio card like Template (Empty, gstack (SOON) and Create button

Q3.2 oui

Q3.3
Non plutot comme ça (simplifier car plus de chose acrtuellement)
[mac button window control]
─────────────────────────────────
[back forward button] [Hitory button] [Search btn to trigger command component] ← non on verra v0.0.3
─────────────────────────────────
Projects [+ Add a project]
▾ project-alpha
◦ workspace-1 (active)
◦ workspace-2
▸ project-beta

───────────────────────────────── ← nouveau groupe
Chats [+ New ask chat] ← crée un Ask chat non-contextualisé
◦ Today
◦ "title generated by the first prompt - Untitled if nothing in the prompt"
◦ Yesterday
◦ ...

─────────────────────────────────
[Help] [⚙ Settings]

Q3.4
icon branch (replace by cli loader if chat llm working) + workspace name (mais chat title si le chat llm déjà ecris qui prend le nom de l'intention pour permettre au user de mieux comprendre) ce generated_name est important est dois etre stocké en base car utiliser aussi dans le breadcrumb et persistent. (title in bold if unread)
Status indicator will be visible in popover card (worspace name + status indicator + title chat and last llm response in one line and date just now or 2min ago with dayjs) add this card popover in specs

Q3.5 (a) toute question déjà implementé avec context menu et boutons. Ajoute instruction pour verifier existant et voir si UI est reelement implementé car il y a l'UI mais pas comportement forcement appliqué.

Q3.6
je n'ai pas trop le filtre workspace_id IS NOT NULL car implicite regle et ask_chats ne va pas car il pourrai peut etre y avoir des chat de type ask dans des contextes de workspace. ET j'aimerai que via les chats on puisse atteché un context folder par exemple en effectuant @workspace-name et finalement il sera possible d'avoir un chat avec context et meme different de type "Ask" donc peut etre renger dans un workspace system car pourraetre de tous les type...

Q3.7 Oui fait une polish

Bloc 4
Q4.1 a
Q4.2 Ask chat qui ensuite attache un workspace reste en ask pas de changement auto.
Q4.3 (a) peut etre utiliser le local storage pour ça ? pas sur que ça soit le mieux d'utiliser la bdd pour ça ?
Q4.4 (d))

Q4.5 oui radio à 3 valeurs (par contre le mode est changeable avant chaque questions)
Q4.6 pas forcement utile par contre un loader cli dans le tab à la place de l'icon si chat en cours
Q7 oui a

Autre chose sur le composer il faudra spécifier les feature de raccourci notaement :

- "/" ouvre un menu qui ouvre les skills mozart (skills custom mais aussi skills provenant de claude code si spawn) si je tape "/test" filtre par texte "test"
- "@" ouvre un menu pour ajouter du context (terminal, web, PR, other workspace, other chat...)
  If i tape @some it filter the menu by some, always tab or click to select the option.
  Some filter shortcut to filter by type like
- @@ directly go to web option tab to validate and wait url.
- @# chortcut to filer PRs
- @> terminal option context
- @& workspaces (group by projects current project first)
- @$ chats (group by workspace current workspace first)
  Context is automatically injected in the prompt (in background)

Q5.1
utilise HlmCombobox with group and separator
Q5.2 chip atomique, supprimable au Backspace dans le texte comme Notion
Q5.3 skills du projet (le projet hérite des skills par défault du user global qui elle meme herite de skills par default set par Mozard certaine non supprimable il faudra spécifié ça dans l partie gestion settings) peut etre que dans le l'initialisation du projet (ref à project initialisation il faudra recuperer s'il y a desfichier de skills comme claude code skills.. pour adapter les skills du projet il faudra differencier peut etre les skills mozart et celle provenant d'un projet) En effet on pourra imaginer une bibliotheque de skills accessible via mozart marketplace dans l'app web par exemple v0.0.X dans longtemps et managé ça dans desktop app.
Mais je pense qu'il faut une table skills pour la bdd. en init du projet skills pushé by projectId ou par refresh skills necessaire.
Q5.4 oui chip atomique, supprimable au Backspace dans le texte comme Notion
Q5.5 oui chip atomique, supprimable au Backspace dans le texte comme Notion
Q5.6 a
Q5.7 oui pour les 3 suggestions mais un warning visuel à 5+
Q5.8 a (pour info les chip sont des petit rectangle avec mini inon du type de context et le nom ou contexte ex pour markdown [m|readme.md]) peut etre un affichage different pour les reference au PR mais on verra plus tard je te laisse spécifier si tu as des idées...
5.9 je dirait ordre mis par le user pour respecter son intention. plusieur skills possible si le provider gère les prompt multiskills à voir suivant le provider. D'ailleurs ça me fait pensé qu'il faudra peut etre faire provider pour gerer les providers en db ou llm-provider ou seulement laisser ce state coté applicatif pour eviter de charger la bdd car en plus la bdd local est dédié au user ne rien mettre de critique qu'il pourrai modifier.

Q8.1 Phases priorisées commme sui Phase 1 (Project + Workspace flow) → Phase 2 (Chat + Composer + Modes) → Phase 3 (Agent stream + Timeline + Parser) Il faudra demander specification precises en fournissant UI claude et créer un parser pour claude avec adaptateur specs claude et UI mozart → Phase 4 (Git changes + Files + Terminal + IDE) → Phase 5 (Auth + Foundations) → Phase 6 (Polish + Onboarding tour). Chaque phase est démontrable. Ne pas oublier les autre specs mais post MVP.
Q8.2 a oui une fois llm termine reponse il emet une notification (peut y avoir un son d'ailleurs) qui passe le workspace en unread si pas sur le chat correspondant oui le unread devrai etre sur les chats (il y a peut etre une migration à faire ici important!!!) et si workspace à un de ces chat en unread il est aussi en unread.
Q8.3 b
8.4 les composant utilisé ne son pas beau car il y a des collapse mais avec des arrow c'est moche et pas aligné je pense qu'il faut tout enlever pour le moment juste afficher le texte llm en brut et on fera une passe dédié en specifiant l'UI voulu en donnant des reference de claude UI par exemple. perte de focus aussi je crois scroll trop gros ou pas assez. Enleve les technique de scroll actuell car patch degeulasse. On fera qqch de propre avec anchor mis apres le texte injecté par le llm et un viewmodel() pour y acceder.
