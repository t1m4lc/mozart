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

---

Plus the manual checkpoint sequence in atom 7. The Phase 5 DoD is met
when every bullet of plan.md §1483-1498 demoable milestone passes
without the Phase 6 onboarding/tour code present (those routes
are TODO stubs only).

     when every bullet of plan.md §1483-1498 demoable milestone passes
     without the Phase 6 onboarding/tour code present (those routes
     are TODO stubs only).

     Critical files modified

     - apps/desktop/src-tauri/Cargo.toml, tauri.conf.json,
     capabilities/default.json, src/lib.rs, src/auth/**,
     src/commands/mod.rs, src/bindings_export.rs
     - apps/desktop/src/app/app.config.ts, app.routes.ts
     without the Phase 6 onboarding/tour code present (thoserroutes
     are TODO stubs only).

     Critical files modified

     -uapps/desktop/src-tauri/Cargo.toml, tauri.conf.json,
     capabilities/default.json, src/lib.rs, src/auth/**,
     src/commands/mod.rs, src/bindings_export.rs overlay
     - apps/desktop/src/app/app.config.ts, app.routes.tsdy carries
     - apps/desktop/src/app/core/{auth.guard.ts,tauri-adapters.ts}
     - apps/desktop/src/app/domains/auth/** (new→domain)hold
     - apps/web/package.json, src/app/app.{co fig,routes}.ts,
     src/app/{pages,domains/auth,shell}/**,ssrc/styles.css1 the user re-

     Out of scope (Phase 6+)

     - GitHub connection beyond what the JWT claim already carries
     - Account / billing / settings on apps/web
     - Account / billing / settings on apps/web
     - Anthropic API key migration from keyring → Stronghold
     - Multi-account / account switcher
     - Token refresh endpoint (silent refresh) — for v0.0.1 the user re-
     signs in if the 7-day Clerk session expires
     - Account / billing / settings on apps/web
     - Anthropic API key migration from keyring → Stronghold
     - Multi-account / account switcher
     - Token refresh endpoint (silent refresh) — for v0.0.1 the user re-
     signs in if the 7-day Clerk session expires
     - Landing site (apps/landing) integration

Phase 3b — Claude-style Timeline UI

Context

Phase 3a (commits 21975a6, 78ddfeb, c0f3626) shipped everything except the
visual timeline:

- Pure parser+reducer in apps/desktop/src/app/domains/llm-model/data/stream/
  (event.types.ts, reducer.ts, fixtures, specs).
- Message.turnState?: TurnState on apps/desktop/src/app/domains/chat/data/message.model.ts:28,
  populated by chat.facade.ts:495-537 on every AgentEvent, persisted via
  chats.adapter.updateTurnState() and chat.dto-mapper.turnStateToJson into
  messages.timeline_json.
- Anchor + autoFollowChat scroll plumbing.
- Off-workspace notification + sound on done.

What remains is the cinematic Claude-style turn UI that replaces the
provisional <hlm-message-body> in agent-message.ts. The reducer already
exposes state.items[], state.summary, state.outcome, state.elapsedMs,
and state.showDoneMarker — Phase 3b is a pure consumer.

Phase 3b ships ONLY the UI layer in libs/ui/timeline/. Parser + reducer +
chat facade are not touched.

Scope decisions (locked)

1.  Appendix A first — docs/specs/llm-stream-parser.md §A is still all
    <!-- TODO Phase 3b prep -->. The spec calls it a hard blocker. Atom 0
    captures real Claude.ai DOM/CSS into the appendix before Atom 1 starts.
2.  Plan-mode UI deferred to Phase 3c. No producer emits plan_proposal
    today (reducer + Rust claude_cli/parser.rs don't know about it). Bundling
    it with its producer keeps Phase 3b a clean UI swap with zero reducer churn.
3.  libs/ui/** scope grant. CLAUDE.md freezes libs/ui/** unless the user
    explicitly approves it. Phase 3b is fundamentally a libs/ui/timeline/
    build-out. Approval is implicit in the "/plan Phase 3b" instruction; this
    plan re-states it for the record.

Architecture overview

domains/chat/ui/agent-message/agent-message.ts (chat domain — wires)
│
│ [state]="message().turnState"
▼
libs/ui/timeline/src/lib/turn-container.ts (public)
│
├── turn-header.ts (shimmer summary + chevron)
└── turn-body.ts (collapsible)
├── message-body.ts (already shipped — Phase 3a)
└── timeline.ts
├── timeline-item.ts (dispatches to renderer)
│ └── renderers/\* (one per TurnItemKind)
│ ├── thinking-renderer.ts
│ ├── file-read-renderer.ts
│ ├── file-edit-renderer.ts
│ ├── file-create-renderer.ts
│ ├── shell-renderer.ts
│ ├── search-renderer.ts
│ ├── generic-tool-renderer.ts
│ └── tool-renderers.registry.ts (Record<TurnItemKind, Type>)
├── done-marker.ts
└── error-marker.ts

libs/ui/timeline/src/index.ts exports only MessageBody (existing) and
TurnContainer (new). Everything else is private.

TurnContainer consumes TurnState as a type-only import from
@mozart/llm-model (audit A2.5 already permits this). No runtime imports
from any @mozart/\* domain. No @tauri-apps/api anywhere in libs/ui/.

Atoms

Atom 0 — Capture Appendix A reference snippets (prerequisite)

Not code work. Use the /browse skill (or capture manually) on a real
Claude.ai turn that includes file edits + tool calls + thinking blocks.

For each section in docs/specs/llm-stream-parser.md §A, paste:

- §A.1 — public Claude.ai share URL of the reference conversation
- §A.2 — turn header (shimmer summary + chevron) DOM + CSS
- §A.3 — timeline item (active state, shimmer on title) DOM + CSS
- §A.4 — file chip + diff stats DOM + CSS
- §A.5 — collapsed thinking block DOM + CSS
- §A.6 — done marker DOM + CSS
- §A.7 — notes (animation easing, transitions, anything non-obvious)

Deliverable: the appendix is no longer all TODO. Atoms 1-5 use it as
ground truth when textual specs are ambiguous.

Manual test: grep -c "TODO Phase 3b prep" docs/specs/llm-stream-parser.md
→ 0.

---

Atom 1 — TurnContainer + TurnHeader + TurnBody scaffold

Goal: Replace <hlm-message-body> in agent-message.ts with
<hlm-turn-container [state]="ts">. Header shows summary with shimmer while
streaming; chevron collapses body smoothly. No timeline items yet — body just
hosts the existing <hlm-message-body>.

Files added (libs/ui/timeline/src/lib/):

- turn-container.ts — public, OnPush, signal state: InputSignal<TurnState>,
  collapsed: model<boolean>(false), output (fileChipClick: TurnFileChipEvent)
  (wired in Atom 4; defined here so the surface is stable).
- turn-header.ts — private. Renders state.summary || 'Working…' with
  .shimmer-text class when state.isStreaming. Chevron button toggles
  collapsed. Reduced-motion: shimmer falls back to muted solid via media query.
- turn-body.ts — private. Wraps <ng-content> in a grid-template-rows: collapsed ? 0fr : 1fr transition (NOT max-height, per spec
  §5.3).

Files added (libs/ui/timeline/src/lib/styles/):

- shimmer.css — @keyframes shimmertext from spec §6.1, the .shimmer-text
  class, and the reduced-motion override. Imported via styles: in
  turn-header.ts.

Files modified:

- libs/ui/timeline/src/index.ts — add export { TurnContainer } from './lib/turn-container'
  and export type { TurnFileChipEvent } from './lib/turn-container'.
- apps/desktop/src/app/domains/chat/ui/agent-message/agent-message.ts —
  switch template to @if (message().turnState; as ts) { <hlm-turn-container [state]="ts" /> } @else { <hlm-message-body
  [text]="message().content" [streaming]="\_isStreaming()" /> }. Fallback covers DB rows from before
  Phase 3a's timeline_json column existed.

Manual test:

1.  pnpm nx serve desktop, open any workspace, send a prompt.
2.  Header reads the streaming summary; shimmer animates left-to-right.
3.  On done, shimmer stops, text becomes solid.
4.  Click chevron → body collapses smoothly (grid-template-rows transition).
5.  Reload page. Old messages (before Phase 3 migration) still render via the
    <hlm-message-body> fallback.
6.  DevTools → emulate prefers-reduced-motion: reduce → shimmer becomes a
    solid muted color, no animation.

---

Atom 2 — Timeline + TimelineItem + DoneMarker / ErrorMarker + Generic renderer

Goal: Render state.items[] as a vertical timeline. Active items shimmer
their title; DONE items go solid; terminal markers appear on outcome.

Files added (libs/ui/timeline/src/lib/):

- timeline.ts — private. Renders @for (item of items(); track item.id) { <hlm-timeline-item [item]="item" /> } with the geometry from
  spec §6.2:
  20px gutter via pl-5, 1px connector via a pseudo-element / Tailwind
  before:absolute, 8px between items via gap-2.
- timeline-item.ts — private. Base wrapper that resolves the renderer
  component from the registry by item.kind. Emits (fileChipClick) upward.
  Handles per-item collapse for renderers that opt in (Atom 3+).
- done-marker.ts — private. check-circle icon (Lucide circle-check),
  green-tint, label "Done". Appears when state.showDoneMarker is true and
  state.outcome === 'done'.
- error-marker.ts — private. x-circle icon, red-tint, label "Error".
  Appears when state.outcome === 'error'.
- renderers/generic-tool-renderer.ts — private. Lucide wrench icon +
  item.title. Default fallback for kind === 'generic' and any unmapped kind.
- renderers/tool-renderers.registry.ts — private. Record<TurnItemKind, Type<unknown>> mapping (NOT a switch — per memory
  feedback_dict_over_switch).
  Atom 2 stub: only 'generic' is wired; later atoms fill the rest.

Files modified:

- turn-container.ts (Atom 1) — add <hlm-timeline [items]="state().items" (fileChipClick)="fileChipClick.emit($event)" /> inside
  <hlm-turn-body>,
  after <hlm-message-body>. Add <hlm-done-marker /> / <hlm-error-marker />
  conditional on state().outcome.

Manual test:

1.  Trigger an agent turn that calls at least one tool (e.g. "list the files in
    this project").
2.  While the tool is running, the new TimelineItem appears in ACTIVE state
    with shimmer on its title and a solid icon.
3.  When the tool completes, shimmer stops, icon stays solid, connector line
    continues.
4.  On done, <hlm-done-marker /> appears with green check + "Done" label.
5.  Trigger an error path (kill the agent mid-stream or pick a bad prompt) →
    <hlm-error-marker /> renders red.
6.  Geometry visually matches Appendix A.3 snippet.

---

Atom 3 — Thinking + Shell + Search renderers + per-item collapse

Goal: Three more renderers, plus the per-item collapse pattern shared by
all body-bearing renderers.

Files added (libs/ui/timeline/src/lib/renderers/):

- thinking-renderer.ts — Lucide clock icon + "Thinking" title. Body
  (item.body) collapsed by default. On expand, render reasoning text in a
  max-h-50 container with bottom fade gradient + "Show more" affordance when
  scrollHeight > clientHeight. Per spec §5.3, defaultExpanded=false.
- shell-renderer.ts — Lucide terminal icon + item.title (the command).
  Body shows stdout/stderr from item.body. defaultExpanded based on whether
  body is non-empty.
- search-renderer.ts — Lucide search icon + item.title (the query/glob).
  Body collapsed by default; shows result summary if present.

Files modified:

- tool-renderers.registry.ts — wire 'thinking' | 'shell' | 'search' to
  the new renderers.
- timeline-item.ts — add the shared collapse pattern (signal expanded,
  initialized from item.defaultExpanded, toggled by clicking the row).
  Use grid-template-rows: 0fr → 1fr transition; reduced-motion strips the
  transition but keeps the toggle functional.

Manual test:

1.  Trigger a turn that emits a thinking block (Claude CLI streams these
    when --include-partial-messages is on, which is the case per
    runner.rs). See item collapsed by default with reasoning hidden.
2.  Click the thinking row → expands smoothly to show reasoning text. Long
    reasoning is capped with fade gradient + "Show more".
3.  Trigger a turn that runs bash (e.g. "run ls"). Shell item shows
    command title; expand → stdout visible.
4.  Trigger a turn with grep/glob. Search item appears with query.

---

Atom 4 — File chip + Diff stats + FileRead / FileEdit / FileCreate renderers

Goal: The three file-touching renderers, with chip + diff stats per spec
§6.4-6.5.

Files added (libs/ui/timeline/src/lib/):

- file-chip.ts — private. Span with font-mono text-[10px] h-5 px-1.5 rounded-md bg-muted/40 text-muted-foreground inline-flex
  items-center,
  ellipsis on overflow. Output (chipClick) emits { path }. Reads from
  TurnFileChip { label, added?, removed? } already on event.types.ts:39.
- diff-stats.ts — private. Inline +N (forest-green) / −N (danger).
  Hidden when both are 0 / undefined.
- renderers/file-read-renderer.ts — Lucide file-text icon + <hlm-file-chip>.
  No diff stats. Collapsed by default.
- renderers/file-edit-renderer.ts — Lucide file-pen icon + <hlm-file-chip>
  - <hlm-diff-stats>. Expanded by default per spec §5.3.
- renderers/file-create-renderer.ts — Lucide file-plus icon (green tint) +
  <hlm-file-chip>. No diff stats (whole file is new).

Files modified:

- tool-renderers.registry.ts — wire 'file-read' | 'file-edit' | 'file-create'.
- timeline-item.ts — bubble (chipClick) from chip → item → timeline →
  TurnContainer → (fileChipClick).
- agent-message.ts — handle (fileChipClick): in v0.0.1, copy path to
  clipboard via navigator.clipboard.writeText(path) + toast (use the
  existing notification service). Phase 4 (already shipped per recent commits)
  may have a diff aside; if so, route there instead. Confirm at implementation
  time by reading domains/workspaces/feature-aside/.

Manual test:

1.  Trigger a turn that edits a file: file-edit item shows file chip + +N/−N
    stats.
2.  Trigger a view/read_file call: file-read item shows chip, no stats.
3.  Trigger a write_file/create_file call: file-create item shows chip in
    green tint.
4.  Click any chip → toast confirms path copied to clipboard (or, if Phase 4
    diff aside is wired, opens that aside on the file).
5.  Visually matches Appendix A.4 snippet.

---

Atom 5 — Sandbox demo route + reduced-motion audit + anti-regression checks

Goal: A non-prod route that demos every renderer + outcome state from
fixtures, plus a sweep through the spec's §9 anti-regression checks.

Files added:

- apps/desktop/src/app/pages/**sandbox/timeline.page.ts — gated to non-prod
  via import.meta.env.DEV (or environment.production). Loads the existing
  **fixtures**/text-only.json, multi-tool-with-thinking.json,
  error-mid-stream.json from domains/llm-model/data/stream/**fixtures\_\_/,
  reduces them via applyAgentEvent to produce TurnStates, and renders
  several <hlm-turn-container> instances side-by-side: streaming, done,
  error, collapsed.
- One additional fixture if needed for the file-renderer demo (mock a
  multi-tool turn with file-edit + file-create items).

Files modified:

- apps/desktop/src/app/app.routes.ts — register /\_\_sandbox/timeline
  conditionally on dev build.

Verification (read-only commands):

# Spec §9.1-9.6 + composer-timeline-ui.md §7

grep -rn "FormGroup\|FormControl\|FormBuilder" libs/ui/timeline # → 0
grep -rn "@tauri-apps/api" libs/ui # → 0
grep -rn "from '@mozart/" libs/ui/timeline # → only `import type` of TurnState
grep -c "ChangeDetectionStrategy.OnPush" libs/ui/timeline/src/lib/ # → equals number of @Component
grep -c "TODO Phase 3b prep" docs/specs/llm-stream-parser.md # → 0

Manual test:

1.  pnpm nx serve desktop, navigate to /\_\_sandbox/timeline. All renderer
    variants display from fixtures.
2.  DevTools → emulate prefers-reduced-motion: reduce → shimmer becomes
    static, expand/collapse becomes instant but still functional.
3.  Send a real prompt to a real workspace. Live turn renders identically
    to the sandbox fixtures (no regression vs Phase 3a text rendering).
4.  Stop a turn mid-stream → ACTIVE item demotes to DONE, no orphan ACTIVE
    left behind (spec §9.3).
5.  Re-render the same chat (navigate away + back) → identical output, no
    duplicate items (spec §9.1; items keyed by item.id).

---

Critical files reference

Reused (not modified):

- apps/desktop/src/app/domains/llm-model/data/stream/event.types.ts:6-70
  — AgentEvent, TurnItem, TurnFileChip, TurnState. Sole contract.
- apps/desktop/src/app/domains/llm-model/data/stream/reducer.ts:33-148
  — applyAgentEvent. Used in Atom 5 sandbox to replay fixtures.
- apps/desktop/src/app/domains/chat/data/chat.facade.ts:495-537 — already
  drives applyAgentEvent + persists turnState. Untouched.
- libs/ui/timeline/src/lib/message-body.ts — kept; rendered inside
  <hlm-turn-body>.

Modified (slot for switch):

- apps/desktop/src/app/domains/chat/ui/agent-message/agent-message.ts:11-30
  — template swap (Atom 1) + (fileChipClick) handler (Atom 4).

Added under libs/ui/timeline/src/lib/:

turn-container.ts, turn-header.ts, turn-body.ts, timeline.ts,
timeline-item.ts, done-marker.ts, error-marker.ts, file-chip.ts,
diff-stats.ts, styles/shimmer.css, renderers/{generic,thinking,shell, search,file-read,file-edit,file-create}-renderer.ts,
renderers/tool-renderers.registry.ts.

Public exports (libs/ui/timeline/src/index.ts): add TurnContainer +
TurnFileChipEvent type. Everything else stays private.

Conventions to respect

- Tailwind: utilities only, no arbitrary values, no :host selectors,
  use host: prefix in host: map. Per memory feedback_tailwind_styling.
- Renderer registry: Record<TurnItemKind, Type<unknown>>, NOT a switch.
  Per memory feedback_dict_over_switch.
- viewChild signal API for any DOM access (e.g. expand-fade detection in
  thinking-renderer). Per memory feedback_viewchild_signal. - Renderer registry: Record<TurnItemKind, Type<unknown>>, NOT a switch.
  Per memory feedback_dict_over_switch. - viewChild signal API for any DOM access (e.g. expand-fade detection in
  thinking-renderer). Per memory feedback_viewchild_signal. - OnPush on every component. - Functional adapters (no class adapters). Per memory
  feedback_adapter_functional — applies if any registry-helper functions
  are needed. - Vocabulary: never expose worktree, branch_name, HEAD,
  refs/heads, detached in any user-facing string. (Spec §A2.11 already
  clean — keep it that way.)

      Out of scope (deferred)

      - Plan-mode UI (plan_proposal → PENDING + Approve/Cancel) — Phase 3c,
      shipped with its producer (reducer event + Rust parser hook).
      feedback_adapter_functional — applies if any registry-helper functions
      are needed.
      - Vocabulary: never expose worktree, branch_name, HEAD,
      refs/heads, detached in any user-facing string. (Spec §A2.11 already
      clean — keep it that way.)

      Out of scope (deferred)

      - Plan-mode UI (plan_proposal → PENDING + Approve/Cancel) — Phase 3c,
      shipped with its producer (reducer event + Rust parser hook).
      - Full diff viewer on file-chip click — Phase 4 aside (already shipped
      per feat(phase-4b, atom-4)); Atom 4 routes to it if available, else
      - Full diff viewer on file-chip click — Phase 4 aside (already shipped
      per feat(phase-4b, atom-4)); Atom 4 routes to it if available, else
      copies path to clipboard.
      - Plan-step matching via planStepId — Phase 3c, with plan-mode UI.
      - Token usage display / cost display — captured in TurnState but not
      surfaced until the metrics domain ships (post-MVP, per
      llm-stream-parser.md §10).
      - Storybook for libs/ui — sandbox route in Atom 5 covers the demo
      per feat(phase-4b, atom-4)); Atom 4 routes to it if available, else
      copies path to clipboard.
      - Plan-step matching via planStepId — Phase 3c, with plan-mode UI.
      - Token usage display / cost display — captured in TurnState but not
      surfaced until the metrics domain ships (post-MVP, per
      llm-stream-parser.md §10).
      - Storybook for libs/ui — sandbox route in Atom 5 covers the demo
      need without adding tooling.

● Plan approved and saved to /home/timothy/.claude/plans/fuzzy-crunching-hare.md — 6 atoms (Atom 0 captures Appendix A snippets first, Atoms 1–5 build the UI tree from <TurnContainer> outward, plan-mode UI deferred
to Phase 3c). Per your workflow, I'll wait for the Ultraplan pass before starting Atom 0.

## prompt auth fix

# Mozart — Phase 5 Atom 5 fix : browser → desktop deeplink sur Linux

## Context

- @docs/specs/plan.md → Phase 5 (toujours canonical reference)
- @docs/specs/onboarding-and-auth.md → §1-§6 (auth flow spec)
- @/home/timothy/.claude/plans/eager-riding-spring.md → plan d'implémentation Phase 5
- @/home/timothy/.gstack/projects/t1m4lc-mozart/checkpoints/20260515-181132-phase-5-auth-atom-5-blocked-on-linux-deeplink.md → état exact + ce qui a été essayé

Branche : feat/auth.
Atoms 1-4 commités et fonctionnels (`8f0303a`, `8afdddd`, `eb54b2c`, `eb7d490`).
Atom 5 (apps/web mock-Clerk) scaffold complet **uncommitted** dans le working tree.

## Le blocker (résumé)

Sur Linux (Ubuntu, GNOME/Wayland, Chrome natif + Firefox Mozilla PPA) :

- `xdg-open "mozart://auth?token=X&state=Y"` ✓ Mozart reçoit
- `gio open "..."` ✓ Mozart reçoit
- Click `<a href="mozart://...">` depuis browser apps/web : Chrome dit
  "Launched external handler" dans la console mais Mozart ne reçoit rien.
  Pas de spawn de process, pas de dbus dispatch, console desktop silencieuse.

Le checkpoint liste exhaustivement ce qui a été essayé et n'a pas marché.
Ne pas répéter ces tentatives.

## Method

Suivre la Methodology de plan.md (Phase A reconnaissance + Phase B plan).
**Pas de patches sales** — repenser l'approche.

## Approche recommandée pour Phase B

Pivot du custom scheme `mozart://` vers un **endpoint HTTP local** que le
desktop expose et que le browser hit directement :

- Tauri lance un petit HTTP server sur `127.0.0.1:<random_port>` au boot
- Le port est sauvegardé dans un fichier connu (~/.local/share/build.mozart.desktop/auth-port)
  ou exposé via une commande Tauri
- apps/web `/dashboard` lit ce port (via fetch ou query param que le desktop
  embed dans l'URL `apps/web/login?state=X&port=N`)
- Le bouton "Launch Mozart" fait `fetch('http://127.0.0.1:<port>/auth?token=X&state=Y')`
- Le desktop HTTP server reçoit, valide state, sauvegarde session, navigate

Avantages :

- Le browser fait juste une nav HTTP localhost — pas de custom scheme drama
- Marche identique sur Linux/macOS/Windows
- Plus proche du flow Clerk en prod (Magic Links)
- Le `mozart://` deep-link reste utile pour macOS/Windows en fallback ou pour
  les vrais Magic Links email/SMS post-MVP

Désavantages :

- Faut handle CORS pour que apps/web puisse hit le local server
- Le port est random → faut le passer à apps/web

## Alternative

Si l'HTTP endpoint te semble too much, considère aussi le "Copy launch URL"
button passif sur /dashboard : on accepte que le scheme launch est flaky sur
Linux et on offre un copy-paste workaround. Macos/Windows continueront à
marcher nativement avec le `mozart://`. Décision UX.

- Marche aussi sur macOS et Windows (test packaged build)
- Le scaffold Atom 5 actuel reste utilisable — juste le mécanisme de fire
  change

## Cleanup avant le commit Atom 5 final

- Retirer le code iframe dans `apps/web/src/app/domains/auth/feature-launch-mozart.ts`
  (bloqué par Chrome "user gesture required", inutile)
- Décider du sort du `<a href="mozart://...">` : garder comme fallback ou retirer
- Plan local file → mettre à jour la décision HTTP-endpoint vs custom-scheme
  dans la section Atom 5

● Working tree clean. 5 commits Atom 1→5 sur feat/auth prêts à merge dans main.

Récap pour ta workflow merge :

feat/auth (clean) → merge dans main
main → merge dans feat/phase-6 (ou ta branche Phase 6)

Le FIXME linux-deeplink est dans 3 endroits :

- apps/web/src/app/domains/auth/feature-launch-mozart.ts (top du fichier — devant tout dev qui touche le launch button)
- Commit message de 3a70bcb (visible dans git log)
- Plan local /home/timothy/.claude/plans/eager-riding-spring.md (section Atom 5)

Et le diagnostic complet est dans le checkpoint sauvé :
~/.gstack/projects/t1m4lc-mozart/checkpoints/20260515-181132-phase-5-auth-atom-5-blocked-on-linux-deeplink.md

Pour Phase 6 : tu peux assumer auth fonctionne. Sur Linux pour tester, le user fait xdg-open "mozart://auth?token=demo&state=<from console>" après click Sign in — ça arrive sur le dashboard direct. Phase 6 stub
/onboarding route est déjà décrite dans le plan local (Atom 6) — c'est à compléter après mon résolution du blocker.

Bonne pause. Quand tu reviens sur la branche auth fix : /context-restore + le prompt que je t'ai donné.
