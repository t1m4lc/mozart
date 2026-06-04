# Mozart — Provider architecture & Timeline UX refactor plan

> **Statut** : audit + plan. Aucun code modifié.
> **Date** : 2026-05-25
> **Auteur** : Claude (Opus 4.7), à la demande de Timothy.
> **Portée** : pipeline LLM (Claude Code CLI aujourd'hui), normalisation
> des événements, modèle Timeline, ouverture multi-provider
> (Codex/OpenAI, MCP, API directes), UX timeline « peu d'info qui défile ».
> **Hors-portée** : ContextCompiler, sandbox policy, persistance SQLite
> autre que les colonnes touchées par le pipeline.

---

## 0. TL;DR

- **Scope actif après plan-eng-review (2026-05-25)** : seule
  l'**Étape 3 (UX timeline)** est planifiée pour livraison. Les
  étapes 1, 2, 4 (préparation multi-provider) sont déférées en
  TODO jusqu'à ce qu'un 2e provider soit concrètement à intégrer.
  L'étape 5 (MCP) reste post-MVP optionnel.
- **L'archi est déjà à 70% provider-agnostic** : port `LlmAdapter`,
  type `AgentEvent` canonique, reducer pur, Timeline UI dumb. Voir §1
  pour l'audit complet — il informe ce qu'on FERA quand le moment
  viendra, mais ne se concrétise pas dans ce sprint.
- **Étape 3 livre la valeur la plus pressante** : timeline plus
  lisible, statut stable, niveaux d'affichage (compact/normal/detailed),
  expand/collapse par item — sans toucher au pipeline d'événements ni
  à l'intégration Claude CLI existante.

---

## ÉTAPE 3 — Spec active (post-review)

> Cette section est la **spec à exécuter**. Elle incorpore les
> décisions prises pendant `/plan-eng-review` du 2026-05-25.
> Voir §10 GSTACK REVIEW REPORT pour la traçabilité.

### A. Modèle conceptuel

Deux mécanismes **orthogonaux** doivent coexister :

1. **Density (préférence globale, page Settings)** — filtre quels
   items sont rendus dans la timeline.
   - `compact` : header + assistant prose (post-stream) + DoneMarker.
     Aucun item de la timeline.
   - `normal` (défaut) : header + items à rôle `result` + items à
     rôle `detail` jugés importants (file.edit/create, shell terminé,
     erreurs, plan steps).
   - `detailed` : tous les items, y compris thinking, file.read,
     search, generic.
2. **Per-item expand/collapse (local à chaque ligne)** — chaque
   renderer d'item à rôle `detail` rend son titre par défaut, avec
   un body collapsé scrollable accessible via clic.

Les items à rôle `result` (assistant prose, plan steps, résumé final)
sont **toujours visibles à tous niveaux** et n'ont pas d'expand —
c'est déjà le contenu utile.

### B. Classification des items — static role map

Plutôt qu'un champ `displayHint` sur `TurnItem` (qui duplique la
connaissance), on ajoute une constante à côté du registry existant :

```ts
// libs/mozart-ui/timeline/src/lib/renderers/tool-renderers.registry.ts
export const TOOL_ROLES: Record<TurnItemKind, 'result' | 'detail'> = {
  thinking:      'detail',
  'file-read':   'detail',
  'file-edit':   'detail',
  'file-create': 'detail',
  shell:         'detail',
  search:        'detail',
  generic:       'detail',
  // future kinds (plan-step) ajouteraient 'result' ici
};
```

Un kind = un renderer = un rôle. Source-of-truth unique côté UI.
Aucun champ ajouté sur `TurnItem`. Reducer inchangé.

### C. Density filter — pure computed

Dans `libs/mozart-ui/timeline/src/lib/timeline.ts`, le `_rows`
computed prend en compte le `density` input :

```ts
readonly density = input<'compact' | 'normal' | 'detailed'>('normal');

protected readonly _rows = computed<readonly TimelineRow[]>(() => {
  const level = this.density();
  if (level === 'compact') return [];           // header+prose+done suffisent
  const items = this.items().filter((item) => {
    if (level === 'detailed') return true;
    // 'normal' : on garde 'detail' importants + erreurs
    if (item.state === 'error') return true;
    return PROMOTE_TO_NORMAL.has(item.kind);
  });
  return items.map(/* …existing mapping… */);
});

const PROMOTE_TO_NORMAL: ReadonlySet<TurnItemKind> = new Set([
  'file-edit', 'file-create', 'shell',
  // file-read, search, thinking, generic restent details-only
]);
```

Rien ne change dans le reducer. Rien n'est persisté de neuf. Le
`turn_state` continue d'avoir tous les items — la density est un
**filtre d'affichage**, pas un filtre de stockage.

### D. Density préférence — global setting, pas per-chat

Pas de colonne `chats.timeline_density`. Pas de migration. Pas de
nouvelle commande Tauri. La density vit dans un nouveau service ou
signal globalement injecté, suivant le pattern de `ThemeService`
(`libs/shared-util-theme`) :

```ts
// libs/desktop-ui-state-data-access/src/lib/timeline-prefs.service.ts (nouveau)
@Injectable({ providedIn: 'root' })
export class TimelinePrefsService {
  private readonly STORAGE_KEY = 'mozart-timeline-density-v1';
  private readonly _density = signal<TimelineDensity>(
    this.readFromStorage() ?? 'normal',
  );
  readonly density = this._density.asReadonly();
  setDensity(level: TimelineDensity): void {
    this._density.set(level);
    localStorage.setItem(this.STORAGE_KEY, level);
  }
  private readFromStorage(): TimelineDensity | null { … }
}
```

Settings page (`apps/desktop/src/app/pages/settings.page.ts`) :
nouvelle section "Timeline density" à côté du select de theme, avec
les 3 options. Le smart wrapper `AgentMessage` injecte
`TimelinePrefsService` et passe `density()` au `<mz-turn-container>`.

### E. `level` reste un input UI — pas sur TurnState

`TurnState` reste la projection pure du flux d'événements. Le level
est passé comme `input<TimelineDensity>()` sur `<mz-turn-container>`
et propagé à `<mz-timeline>`. Le reducer ne sait rien de la density.
Les fixtures `reducer.spec.ts` restent stables.

### F. Per-item expand/collapse — pattern existant à généraliser

`ShellRenderer` a déjà un `_expanded` `linkedSignal`. Le pattern à
appliquer à tous les renderers à rôle `detail` :

```ts
protected readonly _expanded = linkedSignal<TurnItem, boolean>({
  source: () => this.item(),
  computation: (item, prev) => item.defaultExpanded ?? prev?.value ?? false,
});
```

Renderers à mettre au pattern :
- `ThinkingRenderer` : collapsed par défaut, expand révèle le texte
  de raisonnement (déjà partiellement spec'é dans
  `docs/specs/llm-stream-parser.md` §5.3 / §A.5)
- `FileReadRenderer` : pas de body en général (juste un chip path)
- `SearchRenderer` : expand révèle les inputs / results
- `GenericToolRenderer` : expand révèle `item.input` / `item.body`
- `FileEditRenderer` / `FileCreateRenderer` : **PAS de body
  d'expand**. Le clic sur le file chip route vers le Files tab du
  workspace en mode diff (cf. §G).
- `ShellRenderer` : déjà fait, par défaut **expand** si body
  présent (utile — l'output est l'info).

### G. File chip click → Files tab en mode diff

Plutôt que copier le path dans le presse-papiers (placeholder
actuel), le clic sur `<mz-file-chip>` route vers la **tab Files du
workspace en mode diff** pour le path donné. Pratiquement : le
smart wrapper `AgentMessage` injecte le router + `WorkspacesFacade`
(ou `FilesFacade` si déjà extrait) et fait :

```ts
async onFileChipClick(event: TurnFileChipEvent): Promise<void> {
  const workspaceId = this.workspaces.activeId();
  if (!workspaceId) return;
  await this.router.navigate(['/workspace', workspaceId, 'files'], {
    queryParams: { path: event.path, view: 'diff' },
  });
}
```

(détails de routing à confirmer en lisant `apps/desktop/src/app/app.routes.ts`).

### H. Status header — synthèse heuristique (inchangé)

Étape 2 (AgentEvent v2) est déférée, donc le synthétiseur de status
reste celui du reducer actuel (`SUMMARY_BY_KIND` map sur le kind du
dernier item actif). On peut **étendre les heuristiques** sans
toucher au modèle d'événements :

```ts
// reducer.ts — extension de la mapping (pas du modèle)
case 'tool_call': {
  const summary = deriveSummary(event.toolName, event.input);
  // deriveSummary regarde aussi le name + l'input pour des phrases
  // plus précises (e.g. "Running tests…" si cmd contient "test").
}
```

Pas de nouveau type d'événement. Pas de `run.status_changed`. La
spec actuelle (§5.1 priority) reste : status_delta agent (non émis
en MVP) > tool title > fallback.

---

## 1. État actuel — schéma mental

```
                         ┌─────────────────────────────────────┐
                         │             Composer                │
                         │  user message → ChatFacade.send…    │
                         └──────────────┬──────────────────────┘
                                        │
                                        ▼
              ┌──────────────────────────────────────────────────┐
              │  ChatFacade._runAssistantTurn                    │
              │    - crée msg assistant (status='streaming')     │
              │    - this.llm.stream({workspaceId, chatId, …})   │  ← LLM_ADAPTER (token DI)
              │    - for await event of handle.events$:          │
              │        applyAgentEvent(prev, event) → TurnState  │
              │    - flush content/turnState SQLite (debounced)  │
              └──────────────┬───────────────────────────────────┘
                             │ (interface)   LlmAdapter.stream()
                             ▼
        ┌──────────────────────────────────────────────────────────────┐
        │  TauriClaudeAdapter   (libs/desktop-core-tauri/.../tauri-…)  │
        │   ‣ ouvre un Channel<ClaudeStreamEvent>                      │
        │   ‣ commands.startAgentRun(workspaceId,chatId,msgId,mode,ch) │
        │   ‣ écoute events.agentRunTerminated → done/stopped/error    │
        │   ‣ translate(rust event) → AgentEvent (anthropic.parser.ts) │
        └──────────────┬───────────────────────────────────────────────┘
                       │  Tauri IPC (Channel + Event)
                       ▼
   ┌────────────────────────────────────────────────────────────────────────┐
   │  RUST — apps/desktop-tauri/src/claude_cli/                             │
   │                                                                        │
   │  commands::start_agent_run                                             │
   │    → context_compiler::compile     (LLMEnvelope, 7 layers)             │
   │    → providers::ClaudeCliRenderer  (LLMEnvelope → bytes + nonce)       │
   │    → runner::spawn_run                                                 │
   │        spawn `claude -p … --output-format=stream-json`                 │
   │        BufReader stdout → parser::parse_line → Vec<StreamEvent>        │
   │        emit on Channel + INSERT one row per event in agent_events      │
   │        on exit emit AgentRunTerminated{run_id,status,workspace_id}     │
   └────────────────────────────────────────────────────────────────────────┘
```

**Pipeline lu de gauche à droite (en partant du process child)** :

```
claude CLI stdout (Anthropic stream-json envelopes)
   │
   ▼  parser.rs   ← reconnaît {type:"stream_event"|"user"|…}, recolle
   │              les content_block_* multi-lignes, ignore les bruits
StreamEvent (Rust enum)
   │
   ▼  channel.send  + INSERT agent_events
   │
   ▼  IPC Channel<StreamEvent>  (apps/desktop-tauri → renderer)
ClaudeStreamEvent (TS DTO, structurellement identique)
   │
   ▼  anthropic.parser.ts::translate
AgentEvent (Mozart canonique : text | thinking | tool_call | tool_result | status | error | done | stopped)
   │
   ▼  reducer.ts::applyAgentEvent
TurnState (text, summary, items[], outcome, …)
   │
   ▼  ChatFacade store update + flush SQLite (messages.turn_state, messages.content)
   │
   ▼  AgentMessage <mz-turn-container [state]="ts">
TurnContainer → TurnHeader (shimmer summary, chevron)
              → TurnBody  → Timeline (TurnItem[] via tool-renderers.registry)
                          → MessageBody (assistant prose)
                          → DoneMarker / ErrorMarker
```

### 1.1 Inventaire fichiers (références utiles)

| Rôle                              | Chemin                                                                                          |
| ---                               | ---                                                                                             |
| Catalogue providers (UI/select)   | `libs/desktop-llm-model-util/src/lib/providers.config.ts`                                       |
| Port `LlmAdapter` (DI token)      | `libs/desktop-llm-model-data-access/src/lib/llm.adapter.ts`                                     |
| Fake adapter (dev / tests UI)     | `libs/desktop-llm-model-data-access/src/lib/fake-llm.adapter.ts`                                |
| Translator Rust→Mozart            | `libs/desktop-llm-model-util/src/lib/anthropic.parser.ts`                                       |
| Types canoniques + reducer        | `libs/desktop-llm-model-util/src/lib/event.types.ts`, `reducer.ts`                              |
| Adapter Tauri concret             | `libs/desktop-core-tauri/src/lib/tauri-claude.adapter.ts`                                       |
| Wiring DI `LLM_ADAPTER`           | `libs/desktop-core-tauri/src/lib/tauri-adapters.ts:446`                                         |
| Pipeline streaming + persistance  | `libs/desktop-chat-data-access/src/lib/chat.facade.ts:_runAssistantTurn` (l.541)                |
| Modèle Message                    | `libs/desktop-chat-util/src/lib/message.model.ts`                                               |
| Timeline UI (composants dumb)     | `libs/mozart-ui/timeline/src/lib/` (turn-container, turn-header, timeline, renderers/, …)       |
| Smart wrapper Angular             | `libs/desktop-chat-ui/src/lib/ui-agent-message.ts`                                              |
| Spec source de vérité Timeline    | `docs/specs/llm-stream-parser.md`                                                               |
| Rust : parseur CLI                | `apps/desktop-tauri/src/claude_cli/parser.rs`                                                   |
| Rust : runner subprocess          | `apps/desktop-tauri/src/claude_cli/runner.rs`                                                   |
| Rust : StreamEvent + Terminated   | `apps/desktop-tauri/src/claude_cli/mod.rs`                                                      |
| Rust : envelope + renderer        | `apps/desktop-tauri/src/claude_cli/envelope.rs`, `providers/claude_cli_renderer.rs`             |
| Schéma SQLite                     | `apps/desktop-tauri/migrations/001_init.sql` (`agent_runs`, `agent_events`), `004_chat.sql`     |

### 1.2 Ce qui est déjà bien fait

1. **Le port LLM est correctement isolé** : `LlmAdapter` est un
   `InjectionToken`, `ChatFacade` n'importe que ce port — pas d'import
   `@tauri-apps/api` côté chat ou UI.
2. **Le reducer est pur**, testé (`reducer.spec.ts`,
   `anthropic.parser.spec.ts`, `tauri-claude.adapter.spec.ts`).
3. **L'UI Timeline est dumb** (libs/mozart-ui/timeline) — pas de
   dépendance vers le chat ou le LLM, juste un input `TurnState`. La
   dispatch tool→renderer passe par un `Record<TurnItemKind, Type>`
   (extensible en une ligne).
4. **Un `FakeLlmAdapter`** existe — sert de référence vivante de la
   surface IPC que tout nouveau provider doit produire.
5. **L'envelope est déjà découplée du transport** côté Rust :
   `EnvelopeRenderer` (pur) + `ClaudeCliRenderer` (impl) prévu pour
   accueillir un futur Anthropic Messages API renderer.
6. **Lossless raw log** : tous les events bruts atterrissent dans
   `agent_events` (y compris `cli_output`), donc le détail debug est
   conservé indépendamment de ce que l'UI affiche.

### 1.3 Couplages implicites à Claude Code CLI

| # | Couplage                                                                                  | Sévérité | Conséquence pour ajouter un provider                                       |
|---|-------------------------------------------------------------------------------------------|----------|----------------------------------------------------------------------------|
| 1 | Module Rust `claude_cli/`, type `TauriClaudeAdapter`, file `anthropic.parser.ts`         | cosmétique | dette de nommage : un dev pense que tout doit y vivre                       |
| 2 | Commande Tauri `startAgentRun(workspaceId,chatId,msgId,mode,ch)` — pas de `providerId`   | bloquant   | impossible de router vers un autre runner sans casser l'API                 |
| 3 | `StreamEvent` (Rust) calqué sur ce que Claude CLI émet (pas de `file.*`/`command.*`/`mcp.*`) | structurel | Codex/OpenAI/MCP émettent des choses qu'on ne peut pas représenter         |
| 4 | `AgentEvent` (TS) idem — pas de `run.started`, `tool.progress`, `mcp.*`, `command.*`     | structurel | la timeline ne pourra pas distinguer "fichier lu" vs "fichier modifié"     |
| 5 | `reducer.TOOL_KIND_RULES` heuristique sur noms Claude (`str_replace`, `bash`, `view`)    | mineur     | Codex (`apply_patch`, `shell`, `read_file`) tombera souvent en `generic`   |
| 6 | Mode (Agent/Plan/Ask) traduit en flags sandbox Claude (`--permission-mode`, …)           | structurel | autres providers ont d'autres surfaces de permission                       |
| 7 | Commentaire reducer : « Claude CLI doesn't emit status_delta, dérivé du dernier tool »   | UX         | un provider qui émet vraiment des statuts ne pourra pas s'imposer          |
| 8 | `cli_output` est droppé côté UI ; pas de canal "debug" exposé en interface              | UX         | impossible d'afficher un "show details" sans nouveau pipeline              |

### 1.4 Limites observées par rapport au brief UX

- **Pas de niveaux d'affichage** : tous les items sont rendus pareil.
  Un tour avec 20 outils → 20 lignes dans la timeline.
- **Pas de séparation chat ↔ timeline** : tout est dans
  `<TurnBody>`. Pas de notion « ce qui mérite d'apparaître dans le
  chat » vs « ce qui reste dans la timeline collapsée ».
- **Statut header dérivé d'heuristiques** : le résumé ne change que
  quand un tool change de kind ; pas de progression réelle (`cleanup`,
  `testing`, `verifying`, `reloading`).
- **Pas de progress event** sur les tools longs (`bash` qui tourne
  20s n'a pas de tick intermédiaire).
- **Pas de support MCP** dans le modèle ; les appels MCP arriveront
  comme des `tool_call` opaques.
- **Pas de file-change distinct du file-edit-tool-call** : on ne sait
  pas si un edit a réussi en regardant la timeline (le `tool_result`
  flippe l'état, mais on n'a pas l'info structurée « ces N fichiers
  ont changé »).

---

## 2. Modèle cible — événements canoniques étendus

L'idée centrale : **trois étages distincts**, chacun avec sa DTO.
On n'invente pas ; on prolonge ce qui existe.

```
┌───────────────────────────────────────────────────────────────┐
│  Étage 1 — Provider raw events                                │
│  Vit dans l'adapter du provider (Rust ou TS).                 │
│  Forme propre à chaque provider. NE TRAVERSE JAMAIS l'IPC     │
│  côté renderer Angular.                                       │
│                                                               │
│  Aujourd'hui : claude_cli/parser.rs::parse_line               │
│  Demain      : codex/parser.rs, openai/sse-parser.ts, mcp/…   │
└───────────────────────────────────────────────────────────────┘
                          │
                          ▼  mapper provider-specific
┌───────────────────────────────────────────────────────────────┐
│  Étage 2 — Mozart canonical AgentEvent (étendu)              │
│  Une seule union. Tous les adapters produisent ceci.          │
│  Persisté tel quel dans agent_events_v2 (debug + replay).    │
│  Voir §2.1 pour la liste complète.                            │
└───────────────────────────────────────────────────────────────┘
                          │
                          ▼  reducer.ts (pur)
┌───────────────────────────────────────────────────────────────┐
│  Étage 3 — TurnState (view model)                             │
│  Construit pour la timeline UI. Filtré par niveau d'affichage.│
│  Chaque TurnItem porte un displayHint : "chat" | "timeline" |  │
│  "details" pour piloter compact/normal/detailed.              │
└───────────────────────────────────────────────────────────────┘
```

### 2.1 `AgentEvent` v2 — surface proposée

Strict superset de l'union actuelle. Les variants existants
restent valides : la migration est purement additive.

```ts
export type AgentEvent =
  // === Lifecycle ===
  | { kind: 'run.started'; runId: string; provider: ProviderId; modelId?: string; startedAt: number }
  | { kind: 'run.status_changed'; status: RunStatus; label?: string } // running|cleanup|testing|verifying|reloading|waiting|…
  | { kind: 'run.completed'; runId: string; elapsedMs: number; usage?: TokenUsage }
  | { kind: 'run.failed'; runId: string; message: string; recoverable: boolean }
  | { kind: 'run.stopped'; runId: string }

  // === Assistant prose ===
  | { kind: 'assistant.text_delta'; delta: string }           // (= ancien 'text')

  // === Reasoning ===
  | { kind: 'thinking.started'; id: string }
  | { kind: 'thinking.delta'; id: string; delta: string }     // (= ancien 'thinking')
  | { kind: 'thinking.completed'; id: string }

  // === Tool calls (provider-agnostic, MCP inclus) ===
  | { kind: 'tool.started';   id: string; toolName: string; family: ToolFamily; input?: unknown; source?: ToolSource }
  | { kind: 'tool.progress';  id: string; delta?: string; pct?: number }  // ticks pour les longs tools
  | { kind: 'tool.completed'; id: string; output?: unknown; summary?: string }
  | { kind: 'tool.failed';    id: string; message: string; recoverable: boolean }

  // === File system observations (typées, distinctes des tool calls) ===
  | { kind: 'file.read';    path: string; toolCallId?: string }
  | { kind: 'file.changed'; path: string; adds?: number; dels?: number; kind: 'create'|'edit'|'delete'; toolCallId?: string }

  // === Shell / commande (extrait du flux tool générique) ===
  | { kind: 'command.started';   id: string; cmd: string; cwd?: string; toolCallId?: string }
  | { kind: 'command.output';    id: string; stream: 'stdout'|'stderr'; chunk: string }
  | { kind: 'command.completed'; id: string; exitCode: number }

  // === MCP ===
  | { kind: 'mcp.call.started';   id: string; server: string; toolName: string; input?: unknown }
  | { kind: 'mcp.call.completed'; id: string; output?: unknown; summary?: string }
  | { kind: 'mcp.call.failed';    id: string; message: string }

  // === Misc / fallback ===
  | { kind: 'status.label'; text: string }   // résumé header (déjà existant comme 'status')
  | { kind: 'raw'; payload: unknown };       // debug, jamais affiché par défaut

export type ProviderId = 'anthropic-cli' | 'openai-codex' | 'anthropic-api' | 'openai-api' | 'local' | 'mcp';
export type RunStatus  = 'starting' | 'running' | 'thinking' | 'tooling' | 'cleanup' | 'testing' | 'verifying' | 'reloading' | 'waiting' | 'done' | 'failed' | 'stopped';
export type ToolFamily = 'file_read' | 'file_edit' | 'file_create' | 'shell' | 'search' | 'web' | 'mcp' | 'generic';
export type ToolSource = 'builtin' | 'mcp' | 'plugin' | 'unknown';

export interface TokenUsage {
  inputTokens: number; outputTokens: number;
  cacheCreationTokens?: number; cacheReadTokens?: number;
}
```

#### Pourquoi cette forme et pas une autre

- **Discrimination par `kind` à un seul niveau** (`tool.started`, pas
  `{type:'tool', sub:'started'}`) : matche le pattern actuel,
  exhaustif via `switch` TS.
- **`tool.*` reste générique** : MCP est un cas de tool avec `source:
  'mcp'`. Pas besoin d'une famille parallèle. Les variants
  `mcp.call.*` sont gardés en plus uniquement parce qu'un appel MCP
  porte des métadonnées (server name) qu'on ne veut pas perdre dans
  `input`.
- **`file.*` distincts des `tool.*`** : c'est l'info que la timeline
  veut afficher comme un chip — séparer permet à un provider de
  l'émettre même quand le tool sous-jacent ne s'appelle pas
  "edit_file" (cas Codex: `apply_patch` modifie plusieurs fichiers).
- **`command.*` distincts** : un `bash` long doit pouvoir streamer son
  output sans réémettre des tool.progress génériques. Les renderers
  shell consomment ces events au lieu de parser `output: unknown`.
- **`run.status_changed`** est l'éq. claude.ai `status_delta` (spec
  §D.2). Devient la source canonique du header shimmer.

### 2.2 Frontière persistance / affichage

| Niveau                       | Quoi                                                                 | Stockage                                                | Affichage                                       |
| ---                          | ---                                                                  | ---                                                     | ---                                             |
| **Raw provider events**      | stdout claude-cli, SSE OpenAI, JSON MCP                              | `agent_events.raw_json` (ajout colonne, nullable)       | jamais, sauf bouton "raw debug" caché derrière dev menu |
| **Canonical AgentEvent[]**   | union §2.1                                                           | `agent_events` (event_type + payload_json existants)    | "Show details" toggle = niveau **detailed**     |
| **TurnState.items[] currated** | sous-ensemble pour la timeline visible                              | colonne `messages.timeline_json` (déjà là)              | **normal**                                      |
| **statusSummary + DoneMarker** | header + outcome final                                              | colonne `messages.turn_state` (déjà là)                 | **compact**                                     |
| **Chat-promoted text**       | sous-ensemble d'`assistant.text_delta` marqué "important"            | `messages.content` (déjà là, déjà accumulé)             | toujours                                        |

Idée clé : la timeline est un **filtrage** sur le canonical log.
Trois display levels = trois prédicats `(event) => boolean`. Stocker
tous les canonical events permet de **re-rendre n'importe quel niveau
a posteriori**, y compris en ouvrant un vieux message.

### 2.3 Display levels (brief UX)

```
compact   → header summary + DoneMarker. Rien d'autre.
            (défaut quand la timeline est collapsed)
normal    → header + ce qui change vraiment dans le workspace :
            file.changed, command.completed, mcp.call.completed,
            tool.failed. Pas les file.read silencieux,
            pas les thinking.delta.
detailed  → tous les TurnItem (équivalent du rendu actuel).
debug     → detailed + colonne raw payload visible à côté.
```

UX dans le chat correspondant :

```
┌──────────────────────────────────────────────────────────────┐
│ ✦  Mise à jour de la timeline UX… (cleanup)            ▽   │ ← header shimmer, status synthétisé
├──────────────────────────────────────────────────────────────┤
│ ● Modifié  apps/.../turn-state.types.ts  +14 −1              │ ← niveau "normal" : file.changed seulement
│ ● Modifié  apps/.../reducer.ts            +8 −2              │
│ ● Échec    pnpm test --filter timeline                       │ ← tool.failed
│                                                              │
│ J'ai mis à jour le reducer pour gérer le nouveau status…    │ ← chat-promoted text
│                                                              │
│ ✓ Done · 4.2 s · 12 fichiers                                 │
│ [Show details ▾]                                             │ ← bascule normal → detailed
└──────────────────────────────────────────────────────────────┘
```

---

## 3. Stratégie adapter / provider

### 3.1 Cible — une interface, plusieurs adapters

```
                       LLM_ADAPTER (DI token, existant)
                                │
                                ▼
                    ┌────────────────────────┐
                    │   LlmProviderRouter    │ ← nouveau, injecté par ChatFacade
                    │   .stream(input)       │
                    └─────────┬──────────────┘
                              │ resolveProvider(modelId)
        ┌─────────────────────┼────────────────────────────┐
        ▼                     ▼                            ▼
┌────────────────┐  ┌────────────────────┐    ┌─────────────────────┐
│ ClaudeCliAdapter│  │ OpenAiCodexAdapter │    │ AnthropicApiAdapter │   …  MCP, fake, local
│ (déjà là, juste│  │ (à créer)          │    │ (à créer)           │
│  renommer)     │  │                    │    │                     │
└────────┬───────┘  └─────────┬──────────┘    └─────────┬───────────┘
         │                    │                         │
         ▼                    ▼                         ▼
    Tauri Channel        Tauri Channel             fetch / SSE
    + Rust runner        + Rust runner             (renderer process)
    (claude-cli)         (codex CLI)
```

**Règles**

- Chaque adapter implémente `LlmAdapter` (déjà défini, signature
  inchangée). Il prend en charge la traduction des events
  provider-specific en `AgentEvent` v2.
- Le `LlmProviderRouter` est juste une indirection : il regarde le
  modelId actif du chat (`chats.model_id`, déjà persisté) et renvoie
  l'adapter correspondant. Aucun état interne, pas un nouveau facade.
- L'adapter Rust correspondant est sélectionné via le **même
  `providerId`** côté Rust dans `commands::start_agent_run` (qui
  prend désormais ce paramètre).
- L'`anthropic.parser.ts` est renommé en `claude-cli.translator.ts`
  et reste dans `desktop-llm-model-util`. Un sibling
  `codex.translator.ts` viendra à côté.

### 3.2 Adapter contract — exemple Codex/OpenAI

Codex CLI (OpenAI Codex) produit également un stream JSON sur stdout,
avec un format différent. Hypothèse de travail (à vérifier au moment
de l'intégration) : événements `delta`, `tool_call`, `tool_result`,
`finish`.

**Où ça vit** :

| Concern                       | Fichier à créer                                                              |
| ---                           | ---                                                                          |
| Rust subprocess + parser      | `apps/desktop-tauri/src/llm_runners/codex/runner.rs`, `…/codex/parser.rs`   |
| Translator TS                 | `libs/desktop-llm-model-util/src/lib/translators/codex.translator.ts`        |
| Adapter Tauri concret         | `libs/desktop-core-tauri/src/lib/llm-adapters/tauri-codex.adapter.ts`        |
| Wiring router DI              | `libs/desktop-core-tauri/src/lib/llm-adapters/llm-provider-router.ts`        |
| Fixtures de stream Codex      | `apps/desktop-tauri/tests/fixtures/streams/codex-*.jsonl`                    |
| Tests parser Rust             | `…/codex/parser.rs::tests`                                                   |
| Tests translator TS           | `…/translators/codex.translator.spec.ts`                                     |
| Test de contrat adapter       | `…/tauri-codex.adapter.spec.ts` (vérifie LlmStreamInput + AgentEvent shape) |

**Procédure** pour ajouter un provider :
1. Capturer 3 fixtures `.jsonl` (réponse simple, tool use, erreur).
2. Écrire le parser Rust pur (fixtures → `Vec<AgentEventDto>`).
3. Brancher le runner subprocess (modèle copié de `claude_cli/runner.rs`,
   mais sans les flags Claude).
4. Écrire le translator TS si l'enum Rust → TS n'est pas 1:1 (souvent
   c'est l'identité une fois que le parser Rust a fait le gros du
   boulot).
5. Enregistrer le couple `(providerId → adapter)` dans le router DI.
6. Activer les rows OpenAI dans `providers.config.ts` (`enabled: true`).

Aucune ligne touchée dans **ChatFacade**, **reducer**, **Timeline UI**.

### 3.3 MCP — où il s'insère

- Un provider MCP n'est pas un "LLM" en soi : c'est un canal d'**outils**
  que l'agent peut appeler.
- Décision recommandée : MCP reste **transparent côté `LlmAdapter`** :
  le runner Claude/Codex décide lui-même d'appeler un outil MCP, et on
  reçoit un `tool.started` avec `source: 'mcp'` + un `mcp.call.*`
  enrichi pour les métadonnées (server, latence). Pas d'adapter LLM
  spécifique MCP.
- Si un jour Mozart pilote directement un serveur MCP (sans LLM), ce
  sera un `LlmAdapter` séparé — la signature accepte n'importe quel
  producteur d'`AgentEvent`.

---

## 4. UX Timeline — refonte

### 4.1 Principes

1. **Le chat ne contient que ce qui mérite d'être lu** : status header
   stable + résumé final + texte assistant. Les tool calls vivent dans
   la timeline collapsable, sauf un sous-ensemble (changements fichiers,
   échecs, étapes plan).
2. **Le header est le statut principal** : une ligne stable qui
   évolue : `Thinking → Reading → Editing → Cleanup → Testing → Done`.
   Driven par `run.status_changed` quand le provider l'émet, sinon
   synthétisé côté reducer (heuristique actuelle, conservée comme
   fallback).
3. **Trois niveaux** :
   - **compact** (défaut quand collapsed) : header + DoneMarker
   - **normal** (défaut quand expanded) : items "importants" seulement
     → `file.changed`, `command.completed (success+failure)`,
     `tool.failed`, `mcp.call.completed`, étapes de plan
   - **detailed** : tous les items (rendu actuel)
   - **debug** : detailed + payload raw à droite (panneau)
4. **Préférence persistée par chat** (colonne
   `chats.timeline_density`, valeurs `compact|normal|detailed`).
   Bascule via un menu icône en haut à droite du `TurnHeader`.
5. **Les détails techniques ne sont jamais perdus** : ils restent dans
   `agent_events` + `messages.turn_state`. Le bouton "Show details"
   bascule simplement le filtrage côté UI.
6. **Pas de relayout** : passer de normal à detailed n'introduit pas
   de saut visuel — la timeline grandit vers le bas, le header reste.

### 4.2 Synthèse du status header

Source par ordre de priorité (existante + ajouts) :

1. **`run.status_changed.label`** explicite du provider (futur).
2. **Heuristique reducer** sur le kind du dernier item actif
   (actuel — conservé). Étendu pour reconnaître :
   - `command.started` avec `cmd` contenant `test|spec|jest|vitest`
     → label `Testing…`
   - `command.started` avec `cmd` contenant `build|tsc|compile`
     → `Building…`
   - `tool.started` avec `family: 'search'` → `Searching…`
   - chaîne de `file.changed` ≥ 2 → `Editing files…`
   - état terminal → résumé final (e.g. `Modified 4 files`).
3. **Fallback** : `Working…`.

### 4.3 Item promotion (qu'est-ce qui apparaît au niveau normal)

```ts
function shouldPromoteToNormal(item: TurnItem): boolean {
  if (item.state === 'error') return true;          // erreurs visibles toujours
  if (item.kind === 'file-edit') return true;
  if (item.kind === 'file-create') return true;
  if (item.kind === 'file-delete') return true;     // (kind à ajouter)
  if (item.kind === 'shell') return true;
  if (item.kind === 'mcp') return true;             // (kind à ajouter)
  if (item.kind === 'plan-step') return true;       // post-MVP
  // thinking, file-read, search, generic → details only
  return false;
}
```

### 4.4 Tool details panel (debug mode)

Pas d'inline payload bruts dans la timeline (pollue). À la place :
- en mode `debug`, un icône `lucideBraces` ou `lucideTerminal` apparaît
  sur chaque item ; clic ouvre un panel aside qui affiche `event.input`,
  `event.output`, et les events bruts associés (`agent_events.raw_json`
  filtrés par tool id).

---

## 5. Modèle d'implémentation — plan par étapes

Chaque étape est un PR autonome, ne casse pas Claude Code CLI, peut
être validée séparément.

> **NOTE — sections 5.1 / 5.2 / 5.4 / 5.5 sont DÉFÉRÉES.**
> Conservées pour référence quand le multi-provider deviendra
> concret. Seule la 5.3 (Étape 3) est active dans ce sprint.

### Étape 1 — Renommer pour préparer le multi-provider (cosmétique, faible risque) [DÉFÉRÉ]

**Objectif** : aligner le vocabulaire avec « provider-agnostic » sans
changer le code de fond.

Changements :
- `apps/desktop-tauri/src/claude_cli/` → `apps/desktop-tauri/src/llm_runners/claude_cli/`
  (le module existant devient une *implémentation parmi d'autres*).
- `tauri-claude.adapter.ts` → `tauri-claude-cli.adapter.ts`.
- `anthropic.parser.ts` → `translators/claude-cli.translator.ts`.
- `providers.config.ts:ProviderId` → ajouter `'openai-codex'` (encore
  `enabled: false`) ; renommer `'anthropic'` → `'anthropic-cli'` côté
  enum (label visible inchangé).
- Mettre à jour `docs/specs/llm-stream-parser.md` (§11) pour refléter
  les nouveaux chemins.

Risque : faible (renames). À faire en 1 commit `refactor(llm)`.
Tests existants doivent passer.

### Étape 2 — `AgentEvent` v2 (additive) [DÉFÉRÉ]

**Objectif** : étendre l'union sans rien casser. Les anciens variants
restent valides ; les nouveaux sont émis quand on les a.

Changements :
- `event.types.ts` : ajout des nouveaux variants `run.*`,
  `assistant.text_delta` (alias de l'ancien `text`), `thinking.*`,
  `tool.*`, `file.*`, `command.*`, `mcp.*`. Les anciens (`text`,
  `thinking`, `tool_call`, `tool_result`, `status`, `error`, `done`,
  `stopped`) **restent** et deviennent des alias internes — pas de
  migration douloureuse.
- `reducer.ts` : un `switch` étendu. Pour les nouveaux variants,
  produire le même `TurnState` que l'équivalent ancien. Les vieux
  fixtures continuent de passer.
- `claude-cli.translator.ts` : peut soit émettre l'ancien soit le
  nouveau ; on conserve l'ancien pour ne rien casser.
- Tests `reducer.spec.ts` + nouveaux tests pour les nouveaux variants.

Risque : faible. Tout commit autonome.
Pre-req pour Étape 3 et 4.

### Étape 3 — Display levels + filtrage timeline [ACTIVE — voir §A-H]

**Objectif** : livrer la nouvelle UX timeline (compact/normal/detailed)
sans toucher au pipeline d'events ni à l'intégration Claude CLI.

Changements (versions corrigées après review) :
- `libs/mozart-ui/timeline/renderers/tool-renderers.registry.ts` :
  ajouter `TOOL_ROLES` constant (§B).
- `libs/mozart-ui/timeline/timeline.ts` : ajouter `density` input,
  filtrer `_rows` (§C). Pas de modification de `TurnState`, pas de
  `displayHint` sur TurnItem.
- `libs/mozart-ui/timeline/turn-container.ts` : forwarder `density`
  vers `<mz-timeline>` et `<mz-turn-body>` (compact = masque tout
  sauf assistant prose).
- Renderers à compléter avec pattern `_expanded` linkedSignal (§F) :
  `thinking-renderer.ts`, `file-read-renderer.ts`,
  `search-renderer.ts`, `generic-tool-renderer.ts`.
- `file-edit-renderer.ts` / `file-create-renderer.ts` : conservent
  juste le chip clickable, pas de body d'expand (§G).
- **Nouveau** `libs/desktop-ui-state-data-access/src/lib/timeline-prefs.service.ts`
  (§D) : signal `density` persisté en localStorage, pattern
  `ThemeService`.
- `apps/desktop/src/app/pages/settings.page.ts` : ajouter une
  section "Timeline density" avec un select (compact/normal/detailed).
- `libs/desktop-chat-ui/src/lib/ui-agent-message.ts` : injecter
  `TimelinePrefsService` et `Router` ; passer `density()` au
  `<mz-turn-container>` ; reroute `fileChipClick` vers la Files tab
  en mode diff (§G).

**Pas de migration SQLite. Pas de nouvelle commande Tauri. Pas de
changement de `chats` schema. Pas de changement du modèle d'events.**

Risque : faible. UI + 1 nouveau service. No breaking change ; le
défaut `'normal'` rend la liste d'items sans le bruit thinking/read.

### Tests requis pour Étape 3

D'après le coverage diagram du review :

| Test | Lib | Type | Notes |
| --- | --- | --- | --- |
| `tool-renderers.registry.spec.ts` étend pour `TOOL_ROLES` | `mozart-ui/timeline` | unit (type) | Chaque `TurnItemKind` doit avoir un role défini |
| `timeline.spec.ts` (nouveau) | `mozart-ui/timeline` | unit | `density=compact` → 0 rows ; `density=normal` → filtre par `PROMOTE_TO_NORMAL` + erreurs ; `density=detailed` → tous |
| Renderers : 4 specs courts (thinking, file-read, search, generic) | `mozart-ui/timeline` | unit | `_expanded` défaut = `false`, click toggle, `defaultExpanded` input override |
| `timeline-prefs.service.spec.ts` | `desktop-ui-state-data-access` | unit | Lecture localStorage absent → `'normal'` ; `setDensity` persiste ; signal réactif |
| `ui-agent-message` smoke test | `desktop-chat-ui` | unit | Density signal change re-rendre ; file chip click navigue |
| Dogfood : sandbox vide → on utilise `FakeLlmAdapter` + change de density depuis settings page | manuel | n/a | Voir D9 |

Aucune régression `reducer.spec.ts` n'est attendue (le reducer n'est
pas touché).

### Étape 4 — `LlmProviderRouter` + 2e provider (Codex/OpenAI) [DÉFÉRÉ]

**Objectif** : ouvrir le pipeline à un 2e provider.

Changements :
- Ajouter un paramètre `providerId: ProviderId` à
  `commands::start_agent_run` (Rust + TS bindings).
  Default fallback `'anthropic-cli'` pour rétro-compat.
- Créer `LlmProviderRouter` (libs/desktop-llm-model-data-access) qui
  injecte les adapters Tauri et dispatch par modelId.
- Réécrire le providing : `LLM_ADAPTER` n'est plus `useExisting:
  TauriClaudeAdapter` mais `useExisting: LlmProviderRouter`.
- Rust : sous-module `llm_runners/codex/` (runner + parser),
  équivalent à `claude_cli/`. Aucune logique commune extraite à ce
  stade (don't pre-abstract).
- TS : `tauri-codex.adapter.ts` + `codex.translator.ts`.
- Tests d'intégration : un fake binaire Codex (équivalent du mock
  binaire Claude utilisé dans les tests Rust actuels).

Risque : élevé sur le périmètre, faible sur l'archi (chaque pièce est
isolée). À faire après une vraie capture de format Codex.

### Étape 5 (optionnelle, post-MVP) — MCP enrichi + Plan mode

- Ajouter `tool.started.source: 'mcp'` aux events Rust côté
  claude_cli (le CLI expose les MCP tools nominalement).
- Renderer dédié `mcp-call-renderer.ts` dans mozart-ui/timeline.
- Activer `PlanProposal` (spec §7) — déjà préparé dans les types.

---

## 6. Risques & garde-fous

| Risque                                                                             | Atténuation                                                                                            |
| ---                                                                                | ---                                                                                                    |
| Régression de la chat UX pendant le rename / l'extension                           | Étape 1 et 2 sont strictement additives ; tous les tests `reducer.spec.ts` + `…parser.spec.ts` gardent leur green |
| Multi-provider mal abstrait → devient un blocker plus tard                          | Pas d'abstraction Rust commune à ce stade (1 seul provider réel). Le router DI est minimal. Re-abstraire seulement quand le 2e adapter révèle des duplications |
| Display level explose la complexité du reducer                                     | Le `level` n'est PAS dans le reducer ; c'est un filtre côté UI (`Timeline` component). Le reducer reste un total order de TurnItems |
| Migration data : timelines existantes en SQLite ont l'ancien format `turn_state`   | Memory `feedback_dev_only_no_migrations` : on est en dev, wipe localStorage + DB est OK. Pas de code de migration |
| Couplage ChatMode (Agent/Plan/Ask) ↔ sandbox flags Claude                         | Hors-scope de cette refacto. À refacturer quand Codex sera ajouté : extraire un trait `ProviderModeAdapter` côté Rust qui mappe `(provider, mode) → flags` |
| Persistance des nouveaux events `file.*` / `command.*` gonfle `agent_events`       | Les nouveaux events sont des projections logiques ; on peut les NE PAS persister doublement (déjà dérivés des `tool.*`). À décider à l'étape 2 |
| Le header status_changed ne s'aligne pas avec ce que Claude CLI émet               | Conserver la dérivation reducer comme fallback (déjà en place). Quand un provider émet vraiment des statuts, il l'écrase |

---

## 7. Fichiers à inspecter / toucher (récap par étape)

### Étape 1 (rename)
- `apps/desktop-tauri/src/claude_cli/` → `apps/desktop-tauri/src/llm_runners/claude_cli/`
- `apps/desktop-tauri/src/main.rs` (ou `lib.rs`) : `mod claude_cli` → `mod llm_runners`
- `libs/desktop-llm-model-util/src/lib/anthropic.parser.ts` → `…/translators/claude-cli.translator.ts`
- `libs/desktop-llm-model-util/src/index.ts` : ré-export
- `libs/desktop-core-tauri/src/lib/tauri-claude.adapter.ts` → `…/llm-adapters/tauri-claude-cli.adapter.ts`
- `libs/desktop-core-tauri/src/lib/tauri-adapters.ts:446` : pointer
- `libs/desktop-llm-model-util/src/lib/providers.config.ts` : enum ProviderId
- `docs/specs/llm-stream-parser.md` (§11 file layout)

### Étape 2 (AgentEvent v2)
- `libs/desktop-llm-model-util/src/lib/event.types.ts` (gros ajout)
- `libs/desktop-llm-model-util/src/lib/reducer.ts` (switch étendu)
- `libs/desktop-llm-model-util/src/lib/reducer.spec.ts` (nouveaux tests)
- `libs/desktop-llm-model-util/src/lib/translators/claude-cli.translator.ts` (émet les nouveaux variants optionnellement)

### Étape 3 (display levels)
- `libs/mozart-ui/timeline/src/lib/turn-state.types.ts` (ajout `displayHint`)
- `libs/mozart-ui/timeline/src/lib/timeline.ts` (filtre par niveau)
- `libs/mozart-ui/timeline/src/lib/turn-density-toggle.ts` (nouveau)
- `libs/mozart-ui/timeline/src/lib/turn-header.ts` (slot toggle)
- `libs/desktop-chat-util/src/lib/chat.model.ts` (ajout `density?`)
- `libs/desktop-chat-data-access/src/lib/chat.facade.ts` (`setChatDensity`)
- `libs/desktop-chat-data-access/src/lib/chats.adapter.ts` (`updateDensity`)
- `libs/desktop-chat-ui/src/lib/ui-agent-message.ts` (pass `level` to TurnContainer)
- `apps/desktop-tauri/migrations/013_chat_timeline_density.sql` (nouveau)
- `apps/desktop-tauri/src/commands/mod.rs` (`update_chat_density` command)

### Étape 4 (router + Codex)
- `libs/desktop-llm-model-data-access/src/lib/llm-provider-router.ts` (nouveau)
- `libs/desktop-core-tauri/src/lib/llm-adapters/tauri-codex.adapter.ts` (nouveau)
- `libs/desktop-llm-model-util/src/lib/translators/codex.translator.ts` (nouveau)
- `apps/desktop-tauri/src/llm_runners/codex/` (nouveau module)
- `apps/desktop-tauri/src/commands/mod.rs::start_agent_run` (param providerId)
- `libs/desktop-llm-model-util/src/lib/providers.config.ts` (activer OpenAI)
- `apps/desktop-tauri/tests/fixtures/streams/codex-*.jsonl` (nouvelles fixtures)

---

## 8. Questions ouvertes pour Timothy

1. **Niveau d'affichage défaut** : `normal` ou `compact` à
   l'ouverture d'un chat ? (le brief penche pour `compact` quand le
   tour est terminé, `normal` quand il est en cours.)
2. **MCP tools** : aujourd'hui le Claude CLI les passe-t-il dans les
   `tool_call` standard (auquel cas on a juste un name particulier),
   ou via un autre canal ? À vérifier sur une capture réelle avant
   l'étape 5.
3. **Codex CLI** : as-tu déjà une intention de l'intégrer
   *concrètement* à court terme, ou c'est une option à garder ouverte ?
   Ça change le niveau de priorité de l'étape 4.
4. **`run.status_changed`** : préfères-tu que ce soit le LLM qui émette
   les statuts (besoin d'un system prompt qui le force à le faire), ou
   garder un synthèse côté reducer (pas de surcoût modèle, mais moins
   précis) ?
5. **Chat-promoted text** : faut-il un mécanisme explicite pour que le
   modèle marque certaines portions du texte comme "à afficher dans
   le chat principal" (e.g. balises `<chat>…</chat>`) ou on traite
   tout `assistant.text_delta` comme du chat de toute façon ?
6. **Plan mode** (spec §7) : encore prévu pour v0.1.0-beta.1 ou bien
   reporté ? Ça influence le besoin de `tool.started.planStepId`.

---

## 9. Définition de "Done" pour cette refacto

- [ ] Étape 1 : tous les renames passés, `pnpm nx graph` sans erreur,
      tests verts. Aucune mention de "claude_cli" hors du module dédié.
- [ ] Étape 2 : `AgentEvent` accueille les nouveaux variants, reducer
      les gère, fixtures existantes inchangées passent toujours,
      nouvelles fixtures couvrent `file.*` et `command.*`.
- [ ] Étape 3 : la timeline a 3 niveaux ; switch persisté par chat ;
      le mode `compact` produit un rendu chat conforme à la maquette
      §4.1 ; aucune régression sur le rendu actuel quand
      `density=detailed`.
- [ ] Étape 4 : un 2e adapter pluggé avec un fake binaire produit la
      même `TurnState` que Claude pour un script équivalent ; le
      `LlmProviderRouter` dispatch en fonction de `chats.model_id`.
- [ ] Doc `docs/specs/llm-stream-parser.md` mise à jour pour refléter
      les chemins et l'union `AgentEvent` v2.

---

*Fin du rapport initial. Voir sections suivantes pour le résultat
de la review eng du 2026-05-25.*

---

## NOT in scope (post-review)

| Item | Pourquoi reporté |
| --- | --- |
| Renames Rust `claude_cli/` → `llm_runners/` (Étape 1) | Cosmétique. Pas de valeur user. À faire en lot avec l'Étape 4 quand Codex sera concret. |
| Extension `AgentEvent` union (Étape 2) | Aucun consommateur dans le scope réduit. Étape 3 fonctionne avec les events existants. |
| `LlmProviderRouter` + adapter Codex (Étape 4) | Codex n'est pas planifié à court terme. Construire l'abstraction maintenant = risque de la voir s'oxider. |
| Renderer DRY refactor (icon state computation dupliquée) | Pré-existant, pas aggravé par Étape 3. Cleanup à faire dans un PR dédié quand on y revient. |
| `MzFileDiffCard` inline dans le body d'expand des file-edit items | Voir D8 — décision : on route vers la Files tab du workspace, pas d'embed inline. |
| MCP-aware events (`mcp.call.*`) | Dépend d'Étape 2. Surface réelle à découvrir via captures Claude CLI. |
| Plan mode UI (PENDING items, Approve/Cancel) | Dépend du backend qui doit émettre `plan_proposal`. Pas livrable seul. |
| Migration SQLite pour density per-chat | Voir D5 — décision : pref globale, pas per-chat. |
| Tauri command `update_chat_density` | Voir D5 — superflu. |
| `chats.timeline_density` colonne | Voir D5 — superflu. |
| `displayHint` champ sur `TurnItem` | Voir D7 — remplacé par `TOOL_ROLES` static map. |
| `TurnDensityToggle` composant per-turn-header | Voir D4 — toggle vit dans Settings, pas sur chaque turn. |

## What already exists (réutilisé tel quel)

- `LLM_ADAPTER` token + `LlmAdapter` interface — pipeline streaming
  inchangé.
- `FakeLlmAdapter` — sert au dogfood density pendant le dev (D9).
- `ThemeService` pattern (`libs/shared-util-theme`) — modèle pour
  le nouveau `TimelinePrefsService`.
- `ShellRenderer._expanded` linkedSignal pattern — à généraliser aux
  autres renderers à rôle `detail`.
- `tool-renderers.registry.ts` — on AJOUTE `TOOL_ROLES` à côté, on
  ne touche pas à `TOOL_RENDERERS`.
- `FileChipBus` + `(fileChipClick)` output — déjà câblé end-to-end,
  on change uniquement la destination dans `AgentMessage`.
- `reducer.ts` + `event.types.ts` — intacts. Aucun risque de
  régression sur `reducer.spec.ts`.
- `SUMMARY_BY_KIND` map — héritée ; on l'étend localement si besoin,
  pas de nouveau modèle d'event.
- `Settings page` — pattern d'ajout existant (theme select).

## Implementation Tasks (Étape 3 only)

Synthétisé depuis les décisions de la review. Chaque tâche dérive d'un
finding précis. Run avec Claude Code ou Codex ; coche au fur et à mesure.

- [ ] **T1 (P1, human: ~30min / CC: ~5min)** — `mozart-ui/timeline` — Ajouter `TOOL_ROLES` static map
  - Surfacée par : D7 (architecture) — kind→role explicite, pas de champ TurnItem
  - Files : `libs/mozart-ui/timeline/src/lib/renderers/tool-renderers.registry.ts`
  - Verify : type test « chaque `TurnItemKind` a un role »

- [ ] **T2 (P1, human: ~1h / CC: ~10min)** — `mozart-ui/timeline` — Density filter sur `<mz-timeline>`
  - Surfacée par : §C — `density` input + filter `_rows` computed
  - Files : `libs/mozart-ui/timeline/src/lib/timeline.ts`, `…/turn-container.ts`
  - Verify : nouveau `timeline.spec.ts` couvre 3 niveaux + error-state visibility

- [ ] **T3 (P1, human: ~1h / CC: ~8min)** — `desktop-ui-state-data-access` — `TimelinePrefsService`
  - Surfacée par : D5 (architecture) + §D — global pref via localStorage
  - Files : `libs/desktop-ui-state-data-access/src/lib/timeline-prefs.service.ts` (nouveau), `index.ts`
  - Verify : `timeline-prefs.service.spec.ts` (defaults to normal, persist, reactive)

- [ ] **T4 (P1, human: ~45min / CC: ~7min)** — `apps/desktop settings page` — Timeline density select
  - Surfacée par : §D — settings est l'endroit naturel pour la pref
  - Files : `apps/desktop/src/app/pages/settings.page.ts`
  - Verify : smoke test (focal change select → service updates)

- [ ] **T5 (P1, human: ~45min / CC: ~7min)** — `desktop-chat-ui` — `AgentMessage` consume density + route file chip
  - Surfacée par : §G + A1 (separate level input) — smart wrapper injecte prefs + router
  - Files : `libs/desktop-chat-ui/src/lib/ui-agent-message.ts`
  - Verify : density signal change → re-render ; chip click navigates to /workspace/:id/files?path=…&view=diff

- [ ] **T6 (P2, human: ~2h / CC: ~15min)** — `mozart-ui/timeline` — Per-item expand sur 4 renderers
  - Surfacée par : §F + clarification user (per-item collapse à la ChatGPT)
  - Files : `libs/mozart-ui/timeline/src/lib/renderers/{thinking,file-read,search,generic-tool}-renderer.ts`
  - Verify : 4 nouveaux spec courts (defaultExpanded false, click toggles, body scrollable)

- [ ] **T7 (P2, human: ~30min / CC: ~5min)** — `mozart-ui/timeline` — Compact = masque items, garde prose+done
  - Surfacée par : §A + brief UX (compact = juste header+résumé)
  - Files : `libs/mozart-ui/timeline/src/lib/turn-container.ts`, `…/turn-body.ts`
  - Verify : ajout cas `density === 'compact'` dans `timeline.spec.ts`

- [ ] **T8 (P3, human: ~15min / CC: ~3min)** — Documentation — update spec
  - Surfacée par : spec llm-stream-parser.md mentionne plan mode + 4 niveaux, à clarifier
  - Files : `docs/specs/llm-stream-parser.md` (§5.3 expand defaults par renderer)
  - Verify : relecture

**Total estimé** : ~6 heures humain / ~1 heure CC pour l'Étape 3 complète.

## TODOs à ajouter dans TODOS.md

Après cette review, 3 entrées sont à pousser dans `TODOS.md` pour ne
pas perdre la cartographie multi-provider :

1. **LLM provider abstraction — multi-provider router**
   - **What:** Renommer `apps/desktop-tauri/src/claude_cli/` → `llm_runners/claude_cli/`, étendre `AgentEvent` union avec les variants `run.*`, `tool.*`, `file.*`, `command.*`, `mcp.*`, ajouter `LlmProviderRouter` côté libs.
   - **Why:** Aujourd'hui le pipeline LLM est implicitement couplé à Claude CLI (nommage, types d'events calqués sur ce qu'il émet). Quand un 2e provider sera intégré (Codex, Anthropic API, …), l'abstraction sera prête.
   - **How to apply:** Reprendre §5.1 / §5.2 / §5.4 de `docs/tmp/2026-05-25-provider-architecture-and-timeline-refactor.md` (sections marquées [DÉFÉRÉ]). Total ≈ 4 PRs incrémentaux. Premier signal de déclenchement : décision concrète d'intégrer Codex CLI ou Anthropic Messages API directe.
   - **Depends on:** rien (Étape 3 ne bloque pas). À déclencher quand un 2e provider est concrètement à intégrer.

2. **Timeline — renderer DRY (icon state computation)**
   - **What:** Chaque renderer (`file-edit`, `file-create`, `file-read`, `shell`, `search`, `thinking`, `generic`) duplique le même `_iconClass = computed(() => state === 'error' ? 'text-destructive' : state === 'active' ? 'text-foreground' : 'text-muted-foreground')`. Factoriser dans un util `iconClassForState(state)` ou une directive.
   - **Why:** Pré-existant, mais Étape 3 ajoute encore des renderers au pattern. Refactor mécanique safe.
   - **How to apply:** `libs/mozart-ui/timeline/src/lib/_icon-state.util.ts`, importé par tous les renderers. Audit que tous utilisent la fonction (greppable).
   - **Depends on:** Étape 3 mergé pour éviter merge conflicts.

3. **MCP-aware timeline rendering**
   - **What:** Quand le pipeline supportera des events `mcp.*` (Étape 2 + capture réelle de ce qu'émet Claude CLI pour les MCP tools), ajouter un renderer dédié `mcp-call-renderer.ts` qui affiche server name + tool name dans le titre, et `mcp.completed` dans le body.
   - **Why:** Aujourd'hui les MCP tools tombent en `generic` car le name (e.g. `mcp__nx-mcp__nx_docs`) n'est pas reconnu par `mapToolNameToKind`. Un renderer dédié donnerait une lecture instantanée.
   - **How to apply:** Dépend de l'extension `AgentEvent` (point 1). Une fois faits, ajout 1 renderer + 1 entrée registry + 1 entrée `TOOL_ROLES`.
   - **Depends on:** TODO #1.

---

## 10. GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | not run |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | not run |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAR (PLAN) | scope reduced 5→1 phase; 6 decisions; 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | not run |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | n/a (internal UI refactor) |

**UNRESOLVED:** 0
**VERDICT:** ENG CLEARED — ready to implement Étape 3 (UX timeline).
Étapes 1/2/4/5 deferred to TODOS.md per scope challenge.

**Decisions made during review (2026-05-25):**
- D2 — Scope reduced from 5 phases to 1 (Étape 3 only).
- D3 — `level` is a separate UI input on `<mz-timeline>`, not on `TurnState`.
- D4/D5 — Density is a global user preference (Settings page), not per-chat.
- D6 — Two orthogonal mechanisms: density (global) + per-item expand (local).
- D7 — Static `TOOL_ROLES` map renderer→role ; no `displayHint` field on `TurnItem`.
- D8 — file-edit/file-create items have no body expand ; chip click routes to Files tab in diff mode.
- D9 — Dogfood via `FakeLlmAdapter` in real chat + unit tests on fixtures (sandbox migration stays in existing TODO).
