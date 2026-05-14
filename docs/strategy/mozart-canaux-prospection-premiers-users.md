# Mozart — Canaux de prospection pour trouver les premiers utilisateurs

## Objectif du document

Ce document ne sert **pas** à prioriser les features du MVP.

Le scope produit de Mozart v0.0.1 est déjà décidé. L’objectif ici est différent : identifier les lieux où trouver les premiers prospects et futurs utilisateurs une fois la première release disponible.

Le but n’est pas de vendre immédiatement Mozart, mais de préparer l’acquisition en comprenant où se trouvent les développeurs qui ont déjà le problème que Mozart adresse : gérer plusieurs agents de code, travailler avec Claude Code / Codex / autres agents, utiliser des worktrees, éviter les conflits, organiser les tâches, et travailler sur Windows, Linux ou macOS.

---

## Positionnement d’approche

Au début, Mozart ne doit pas être présenté comme :

> “Un clone de Conductor cross-platform.”

Cette formulation est trop défensive et trop dépendante d’un concurrent.

L’approche recommandée est plutôt :

> “Mozart aide les développeurs à coordonner plusieurs agents IA de code dans des workspaces isolés, avec une meilleure visibilité sur les tâches, les diffs et les conflits.”

Avant la release, la posture doit rester conversationnelle :

> “Je cherche à comprendre comment les développeurs utilisent aujourd’hui plusieurs agents de code en parallèle.”

Après la release, la posture peut devenir :

> “J’ai construit une première version de Mozart pour les développeurs qui utilisent déjà plusieurs agents de code et veulent un workflow plus propre, notamment avec des git worktrees.”

---

## Profil des premiers utilisateurs recherchés

Les premiers utilisateurs ne sont pas tous les développeurs.

Les meilleurs prospects sont les développeurs qui ont déjà expérimenté au moins une partie du problème :

- ils utilisent Claude Code, Codex, Cursor, Aider, Cline ou un outil équivalent ;
- ils lancent parfois plusieurs agents ou plusieurs sessions en parallèle ;
- ils utilisent ou envisagent d’utiliser des git worktrees ;
- ils travaillent sur Windows, Linux, WSL ou dans un environnement multi-OS ;
- ils ont déjà ressenti de la friction avec les conflits, les diffs, le suivi des tâches ou la perte de contexte ;
- ils sont curieux des workflows multi-agent mais trouvent les outils actuels trop bricolés ;
- ils aiment tester des outils développeurs en early stage.

Le prospect idéal pour Mozart v0.0.1 est donc un développeur déjà avancé dans ses usages IA, pas un débutant qui découvre les agents de code.

---

## Canaux à explorer

### 1. Reddit — r/ClaudeAI

Priorité : très haute.

C’est probablement le meilleur premier canal pour parler à la communauté avant et juste après la release.

Pourquoi ce canal est intéressant :

- beaucoup d’utilisateurs de Claude Code ;
- discussions naturelles autour des workflows IA ;
- présence de développeurs qui testent de nouveaux outils ;
- possibilité de poser des questions sans vendre ;
- bon endroit pour repérer les douleurs autour du multi-agent, des coûts, du contexte et des outils concurrents.

Approche recommandée :

Avant release, commenter des discussions existantes et poser des questions :

> “Quand vous lancez plusieurs agents en parallèle, qu’est-ce qui casse en premier : les conflits git, la perte de contexte, le coût, ou le suivi des tâches ?”

Après release, poster un message de retour d’expérience :

> “J’ai construit une première version de Mozart après avoir étudié les workflows multi-agent. Je cherche 10 développeurs qui utilisent déjà Claude Code / Codex / worktrees pour tester la release et me donner du feedback.”

À éviter :

- poster trop tôt un message promotionnel ;
- comparer Mozart frontalement à Conductor ;
- promettre une vision trop grande avant que le MVP soit utilisable.

---

### 2. Hacker News

Priorité : haute, mais pas en premier.

Hacker News est très intéressant pour Mozart, mais il faut attendre d’avoir une release propre, un README solide et idéalement une courte démo.

Pourquoi ce canal est intéressant :

- forte concentration de développeurs expérimentés ;
- intérêt pour les devtools, les workflows git, les agents IA et les produits open source ;
- capacité à générer beaucoup de feedback qualitatif ;
- bon canal pour crédibiliser le projet.

Approche recommandée :

Ne pas commencer par un “Show HN” trop tôt.

Avant la release, utiliser HN uniquement pour observer et commenter des discussions existantes sur :

- Conductor ;
- Claude Code ;
- Codex ;
- git worktrees ;
- agents parallèles ;
- outils cross-platform ;
- alternatives open source.

Après release, publier un vrai lancement :

> “Show HN: Mozart — a cross-platform desktop app for coordinating coding agents in git worktrees.”

Ce lancement doit pointer vers :

- une page GitHub claire ;
- une démo courte ;
- des instructions d’installation ;
- une explication simple du problème ;
- une liste honnête des limites de la v0.0.1.

---

### 3. GitHub

Priorité : haute.

GitHub est moins un canal d’acquisition directe qu’un canal de confiance.

Pour un outil développeur comme Mozart, beaucoup d’utilisateurs voudront voir le repo, le README, les releases, les issues et la roadmap avant d’installer quoi que ce soit.

À préparer avant la release :

- README clair ;
- section “Why Mozart?” ;
- captures d’écran ;
- roadmap courte ;
- instructions d’installation ;
- limitations connues ;
- changelog ;
- issues avec labels simples : `bug`, `feedback`, `good first issue`, `roadmap` ;
- discussions activées si le projet est open source.

GitHub peut aussi servir à repérer des prospects :

- utilisateurs qui star des projets concurrents ;
- personnes qui commentent sur des outils multi-agent ;
- maintainers de listes “awesome” liées aux agents IA ;
- développeurs qui ouvrent des issues sur les problèmes Windows/Linux ou worktrees.

Approche recommandée :

Après release, contacter quelques personnes de manière très ciblée, jamais en masse :

> “J’ai vu que tu t’intéressais aux workflows multi-agent / worktrees. J’ai sorti une première version de Mozart, un outil cross-platform pour coordonner des agents de code. Ton feedback m’intéresserait si le sujet te parle.”

---

### 4. Reddit — r/LocalLLaMA

Priorité : moyenne maintenant, plus haute plus tard.

Ce canal est très intéressant pour la vision long terme : modèles locaux, multi-provider, réduction des coûts, routing de modèles, mémoire locale.

Pour Mozart v0.0.1, ce n’est pas forcément le meilleur premier canal, car le MVP est davantage centré sur l’orchestration de workflows agents que sur les modèles locaux.

À utiliser plus tard quand Mozart commencera à parler de :

- support multi-provider ;
- modèles locaux ;
- Mistral ;
- réduction des coûts token ;
- routage selon la complexité des tâches ;
- mémoire locale longue durée.

Approche recommandée :

Ne pas pitcher Mozart immédiatement comme outil local-first.

Plutôt poser des questions du type :

> “Pour ceux qui utilisent des modèles locaux avec des agents de code, comment gérez-vous le routing entre tâches simples, tâches complexes et review ?”

---

### 5. Discords de communautés IA / devtools

Priorité : moyenne.

Les Discords peuvent donner de très bons échanges, mais ils sont plus sensibles à l’auto-promotion.

Canaux potentiellement intéressants :

- communautés Claude Code ;
- communautés Cursor ;
- communautés Aider ;
- communautés open source IA ;
- Discords de devtools ;
- Discords d’incubateurs ou communautés founder/dev.

Approche recommandée :

Commencer par participer, répondre, aider, puis demander du feedback en privé ou dans un canal prévu pour les projets.

Message type :

> “Je travaille sur un outil pour mieux coordonner plusieurs agents de code dans des workspaces isolés. Je ne veux pas spammer le serveur, mais si certains utilisent déjà plusieurs agents en parallèle, je serais preneur de feedback sur le workflow.”

---

### 6. X / Twitter

Priorité : moyenne.

X est utile pour construire une narration publique, mais moins fiable pour obtenir des conversations profondes au début.

À utiliser pour :

- build in public ;
- montrer des captures ;
- documenter les choix produit ;
- partager les apprentissages ;
- attirer d’autres fondateurs, investisseurs ou développeurs curieux.

Types de posts utiles :

- “What I learned from studying multi-agent coding workflows” ;
- “Why git worktrees are becoming important for AI coding agents” ;
- “The hard part is not launching 4 agents. The hard part is making sure they don’t step on each other.” ;
- captures de Mozart ;
- mini démos ;
- changelog court.

À éviter :

- thread trop marketing ;
- promesse “révolutionnaire” ;
- comparaison agressive avec Conductor.

---

### 7. LinkedIn

Priorité : faible à moyenne.

LinkedIn peut être utile pour toucher :

- CTOs ;
- fondateurs techniques ;
- développeurs en startup ;
- incubateurs ;
- investisseurs early-stage ;
- équipes qui expérimentent l’IA dans le développement logiciel.

Mais ce n’est pas forcément le meilleur canal pour trouver les premiers utilisateurs très techniques.

À utiliser surtout pour raconter :

- la vision ;
- les apprentissages ;
- les cas d’usage ;
- les retours d’utilisateurs ;
- le côté français / européen / Mistral potentiel.

---

### 8. Meetups développeurs / IA

Priorité : moyenne après release.

Les meetups sont utiles dès qu’il existe une démo montrable en moins de 2 minutes.

Types d’événements à viser :

- meetups IA à Paris ;
- meetups développeurs ;
- meetups open source ;
- meetups Rust / Tauri / Angular si pertinents ;
- événements indie hackers ;
- événements Station F / incubateurs.

Objectif :

Ne pas faire une présentation commerciale, mais montrer un workflow réel :

> “Voici comment je lance deux agents dans deux worktrees séparés, comment je vois leur statut, puis comment je review les diffs.”

À la fin, chercher 3 à 5 testeurs sérieux, pas une grande audience.

---

### 9. Incubateurs et lieux startup

Priorité : moyenne, plutôt après premiers retours utilisateurs.

Les incubateurs sont intéressants car Mozart peut toucher des développeurs et fondateurs qui veulent accélérer la construction de produits avec l’IA.

Lieux potentiels :

- Station F ;
- incubateurs parisiens ;
- écoles d’ingénieurs ;
- communautés founder ;
- programmes IA / devtools.

Approche recommandée :

Ne pas vendre Mozart comme un outil grand public.

Le présenter comme :

> “Un outil pour les fondateurs techniques et développeurs qui utilisent déjà des agents IA pour accélérer le développement, mais qui ont besoin d’un workflow plus propre quand plusieurs agents travaillent en parallèle.”

---

### 10. Communautés open source autour des agents

Priorité : haute mais ciblée.

Ce canal peut être très intéressant si Mozart est open source ou partiellement open source.

Où chercher :

- repos GitHub d’agents de code ;
- outils de gestion de worktrees ;
- projets de wrappers Claude Code / Codex ;
- listes “awesome AI agents” ;
- discussions autour de Aider, Cline, OpenHands, Continue, etc.

Approche recommandée :

Ne pas ouvrir des issues promotionnelles.

Mieux :

- contribuer à des discussions existantes ;
- publier une intégration utile ;
- proposer Mozart dans une liste pertinente uniquement quand le projet est réellement utilisable ;
- demander du feedback à des maintainers précis.

---

## Priorité recommandée pour les premiers efforts

### Avant release

1. Observer Reddit r/ClaudeAI.
2. Commenter des discussions existantes sur les workflows agents.
3. Collecter les mots exacts utilisés par les développeurs.
4. Préparer le README GitHub et la landing narrative.
5. Identifier 20 à 30 prospects potentiels à contacter après release.

### Juste après release

1. Poster sur Reddit r/ClaudeAI.
2. Contacter les prospects déjà identifiés.
3. Partager une démo courte sur X / LinkedIn.
4. Ouvrir GitHub Discussions ou un canal feedback simple.
5. Récolter les 10 premiers utilisateurs actifs.

### Après premiers retours

1. Préparer un lancement Hacker News.
2. Contacter des communautés GitHub/open source.
3. Aller en meetup avec une démo.
4. Tester l’approche incubateurs / Station F.
5. Construire une boucle de feedback régulière.

---

## Premier canal à choisir

Le premier canal recommandé est :

> Reddit r/ClaudeAI

Raison : c’est le meilleur compromis entre pertinence, accessibilité, densité d’utilisateurs Claude Code, tolérance aux discussions exploratoires, et possibilité de trouver les premiers testeurs sans devoir déjà avoir une marque forte.

Ce canal doit être utilisé en deux temps :

1. avant release : écoute, commentaires, questions ;
2. après release : post de feedback + recrutement de 10 testeurs.

---

## Message de post après release

Titre possible :

> I built a small cross-platform app to coordinate coding agents in git worktrees — looking for feedback

Corps du message :

> I’ve been studying how developers run multiple Claude Code / Codex agents in parallel.
>
> A pattern I kept seeing: people use separate terminals, branches, or git worktrees, but the workflow gets messy when it comes to task tracking, diffs, conflicts, and knowing what each agent is doing.
>
> I built a first release of Mozart, a small cross-platform desktop app focused on this workflow.
>
> It’s not meant to replace your agent. The goal is to make multi-agent coding easier to coordinate.
>
> I’m looking for a small group of developers who already use coding agents and are willing to test the first version.
>
> Especially interested if you are on Windows, Linux, WSL, or if you already use git worktrees.
>
> Feedback I’m looking for:
>
> - does the workflow make sense?
> - what feels unnecessary?
> - what is missing before this becomes useful daily?
> - how are you currently solving this manually?
>
> Not trying to sell anything here. I’m mostly looking for honest feedback from people who already feel this pain.

---

## Message DM pour prospects qualifiés

> Hey, I saw your comment about using coding agents / Claude Code / worktrees.
>
> I’m building Mozart, a small cross-platform app to coordinate multiple coding agents in isolated workspaces.
>
> The first version is focused on the workflow, not on replacing the agent itself.
>
> Would you be open to trying the release and giving blunt feedback?

---

## Indicateurs à suivre

Pour chaque canal, suivre :

- nombre de réponses qualifiées ;
- nombre de personnes qui acceptent de tester ;
- nombre de vrais utilisateurs après installation ;
- problèmes récurrents mentionnés ;
- OS utilisé ;
- outil IA utilisé ;
- workflow actuel ;
- fréquence d’usage des agents ;
- intérêt pour Mozart après explication ;
- objections principales.

L’objectif initial n’est pas de maximiser les vues.

L’objectif est d’obtenir :

- 10 conversations de qualité ;
- 5 utilisateurs qui installent réellement ;
- 2 utilisateurs qui reviennent avec du feedback concret ;
- les mots exacts à réutiliser pour la landing page et le lancement Hacker News.

---

## Conclusion

Mozart doit commencer son acquisition dans les communautés où le problème existe déjà.

Le meilleur premier canal est Reddit r/ClaudeAI, parce qu’il permet de parler à des utilisateurs de Claude Code et d’agents IA sans avoir besoin d’un lancement officiel.

GitHub doit servir de base de crédibilité.

Hacker News doit être gardé pour un lancement plus propre, après une première release testée.

Les meetups, incubateurs et communautés offline deviennent intéressants quand Mozart peut être montré en démo courte.

La priorité n’est donc pas de vendre Mozart immédiatement, mais de construire une liste de premiers prospects qualifiés, comprendre leurs workflows, puis les convertir en testeurs dès que la release est disponible.
