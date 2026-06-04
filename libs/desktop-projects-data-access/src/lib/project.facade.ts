import { Injectable, computed, inject, signal } from '@angular/core';
import { DesktopAnalyticsFacade } from '@mozart/desktop-core-data-access';
import type { Project } from '@mozart/desktop-projects-util';
import { UiStateFacade } from '@mozart/desktop-ui-state-data-access';
import { DIALOG_ADAPTER } from './dialog.adapter';
import type { GroupBy } from './project.store';
import { ProjectStore } from './project.store';
import {
  PROJECTS_ADAPTER,
  type DetectedScripts,
  type GithubRemoteStatus,
  type MergeMode,
} from './projects.adapter';

// Status ids whose group-rows the `Collapse all` action targets when
// the user is grouping by status. Mirrors workspaces' UI_WORKSPACE_STATUSES
// — kept inline so this lib has no cross-domain dep on `workspaces`.
const WORKSPACE_STATUS_IDS = [
  'backlog',
  'in_progress',
  'in_review',
  'done',
  'canceled',
] as const;

// Public API of the `projects` domain. Features inject this — never
// the store directly. All mutators are optimistic-first: patch the
// store immediately, persist via Tauri, revert on failure.
@Injectable({ providedIn: 'root' })
export class ProjectsFacade {
  private readonly store = inject(ProjectStore);
  private readonly dialog = inject(DIALOG_ADAPTER);
  private readonly adapter = inject(PROJECTS_ADAPTER);
  private readonly uiState = inject(UiStateFacade);
  private readonly analytics = inject(DesktopAnalyticsFacade);

  // Buffered drag-reorder: a drop fires a 250ms timer; subsequent
  // drops during the timer reset it. Only the final ordering hits
  // Tauri. v0.1.0-beta.1 has no UX for a "save indicator" yet — drops feel
  // instant.
  private reorderTimer: ReturnType<typeof setTimeout> | null = null;

  // P2.6 / AD-02 — per-project merge_mode cache. The right-aside merge
  // button reads this signal as part of the routing chain (workspace's
  // last_merge_action → project mergeMode → default 'pr'). Loaded lazily
  // the first time `mergeModeFor(id)` is read.
  private readonly mergeModeCache = signal<ReadonlyMap<string, MergeMode>>(
    new Map(),
  );
  private readonly mergeModeInflight = new Map<string, Promise<MergeMode>>();

  // P1.1 D9 — per-project GitHub-remote-status cache. The right-aside
  // merge menu reads it to gate the PR action; the create-PR dialog
  // reads it for precise messaging (no-remote vs non-GitHub vs error).
  // Lazy + de-duped on concurrent reads, same shape as mergeModeCache.
  private readonly githubRemoteCache = signal<
    ReadonlyMap<string, GithubRemoteStatus>
  >(new Map());
  private readonly githubRemoteInflight = new Map<
    string,
    Promise<GithubRemoteStatus>
  >();

  // Per-project `.mozart/run.json` script cache. Lazy + de-duped, same
  // shape as the other caches. Powers `effectiveCommandsFor` so the
  // Setup / Run buttons stay enabled even when only the `.mozart/run.json`
  // file is present (DB columns null).
  private readonly detectedScriptsCache = signal<
    ReadonlyMap<string, DetectedScripts>
  >(new Map());
  private readonly detectedScriptsInflight = new Map<
    string,
    Promise<DetectedScripts>
  >();

  // Reads
  readonly all = this.store.projects;
  readonly visible = this.store.visibleProjects;
  readonly hoveredId = this.store.hoveredProjectId;
  readonly groupBy = this.store.groupBy;
  readonly projectFilter = this.store.projectFilter;
  readonly allProjectsSelected = this.store.allProjectsSelected;
  readonly byId = (id: string) =>
    computed(() => this.store.projects().find((p) => p.id === id) ?? null);

  isExpanded(id: string): boolean {
    return this.uiState.isProjectExpanded(id);
  }

  /** P2.6 — reactive view of the cached merge_mode. Returns `null` until
   *  the value is loaded via `ensureMergeMode(id)`. Components can show
   *  a fallback ('pr') while loading. */
  mergeModeFor(id: string) {
    return computed(() => this.mergeModeCache().get(id) ?? null);
  }

  /** Kick the lazy read. Idempotent — a second call while the first is
   *  in flight reuses the same promise. Failures fall back to `'pr'`
   *  silently so the button label still renders. */
  ensureMergeMode(id: string): Promise<MergeMode> {
    const cached = this.mergeModeCache().get(id);
    if (cached) return Promise.resolve(cached);
    const inflight = this.mergeModeInflight.get(id);
    if (inflight) return inflight;
    const p = (async () => {
      try {
        const mode = await this.adapter.getMergeMode(id);
        const next = new Map(this.mergeModeCache());
        next.set(id, mode);
        this.mergeModeCache.set(next);
        return mode;
      } catch (err) {
        console.warn('[projects] getMergeMode failed:', err);
        return 'pr' as const;
      } finally {
        this.mergeModeInflight.delete(id);
      }
    })();
    this.mergeModeInflight.set(id, p);
    return p;
  }

  /** P1.1 D9 — reactive view of the cached GitHub-remote status.
   *  Returns `null` until loaded via `ensureGithubRemoteStatus(id)`.
   *  Consumers treat `null` (pending) defensively. */
  githubRemoteStatusFor(id: string) {
    return computed(() => this.githubRemoteCache().get(id) ?? null);
  }

  /** Convenience boolean for gating surfaces (merge menu): true only
   *  when a usable github.com remote was found. */
  isGithubRemoteFor(id: string) {
    return computed(() => this.githubRemoteCache().get(id)?.kind === 'github');
  }

  /** Kick the lazy read. Idempotent under concurrency. A structural
   *  failure (missing repo row, IPC drop) is cached as an `error`
   *  status so a persistently failing id doesn't hammer the backend on
   *  every signal read; the dialog surfaces the message. */
  ensureGithubRemoteStatus(id: string): Promise<GithubRemoteStatus> {
    const cached = this.githubRemoteCache().get(id);
    if (cached !== undefined) return Promise.resolve(cached);
    const inflight = this.githubRemoteInflight.get(id);
    if (inflight) return inflight;
    const p = (async () => {
      try {
        const result = await this.adapter.githubRemoteStatus(id);
        this.writeGithubRemote(id, result);
        return result;
      } catch (err) {
        console.warn('[projects] githubRemoteStatus failed:', err);
        const fallback: GithubRemoteStatus = {
          kind: 'error',
          message: err instanceof Error ? err.message : String(err),
        };
        this.writeGithubRemote(id, fallback);
        return fallback;
      } finally {
        this.githubRemoteInflight.delete(id);
      }
    })();
    this.githubRemoteInflight.set(id, p);
    return p;
  }

  private writeGithubRemote(id: string, status: GithubRemoteStatus): void {
    const next = new Map(this.githubRemoteCache());
    next.set(id, status);
    this.githubRemoteCache.set(next);
  }

  /** Reactive view of `(runCommand, setupCommand)` merging the DB
   *  columns with `.mozart/run.json` (file wins per the precedence
   *  rule). Returns nulls while the detection probe is still loading.
   *  Consumers should call `ensureDetectedScripts(id)` once at mount
   *  to kick the probe. */
  effectiveCommandsFor(id: string) {
    return computed<{ runCommand: string | null; setupCommand: string | null }>(
      () => {
        const project = this.byId(id)();
        const detected = this.detectedScriptsCache().get(id);
        return {
          runCommand: detected?.run ?? project?.runCommand ?? null,
          setupCommand: detected?.setup ?? project?.setupCommand ?? null,
        };
      },
    );
  }

  /** Kick the lazy `.mozart/run.json` read for `id`. Idempotent —
   *  concurrent calls share the same promise; subsequent calls after
   *  the cache is warm short-circuit. Failures cache empty nulls so a
   *  bad project doesn't hammer Tauri on every signal read. */
  ensureDetectedScripts(id: string): Promise<DetectedScripts> {
    const cached = this.detectedScriptsCache().get(id);
    if (cached) return Promise.resolve(cached);
    const inflight = this.detectedScriptsInflight.get(id);
    if (inflight) return inflight;
    const p = (async () => {
      try {
        const result = await this.adapter.readDetectedScripts(id);
        const next = new Map(this.detectedScriptsCache());
        next.set(id, result);
        this.detectedScriptsCache.set(next);
        return result;
      } catch (err) {
        console.warn('[projects] readDetectedScripts failed:', err);
        const fallback: DetectedScripts = { setup: null, run: null };
        const next = new Map(this.detectedScriptsCache());
        next.set(id, fallback);
        this.detectedScriptsCache.set(next);
        return fallback;
      } finally {
        this.detectedScriptsInflight.delete(id);
      }
    })();
    this.detectedScriptsInflight.set(id, p);
    return p;
  }

  isStatusCollapsed(statusId: string): boolean {
    return this.uiState.isStatusCollapsed(statusId);
  }

  async loadAll(): Promise<void> {
    const projects = await this.adapter.list();
    this.store.setAll(projects);
    // Reconcile sidebar expand state against the new id set — stale
    // expansions for removed projects get dropped.
    const validIds = new Set(projects.map((p) => p.id));
    const kept = [...this.uiState.expandedProjectIds()].filter((id) =>
      validIds.has(id),
    );
    this.uiState.setExpandedProjects(kept);
  }

  async openPickerAndAdd(): Promise<Project | null> {
    const path = await this.dialog.pickFolder();
    if (path == null) return null;
    return this.add(path);
  }

  async add(path: string): Promise<Project> {
    const isFirst = this.store.projects().length === 0;
    const project = await this.adapter.add(path);
    this.store.upsertProject(project);
    this.analytics.track('project_added', { is_first: isFirst, source: 'add' });
    // Auto-expand the freshly added project so the "no workspaces
    // yet" empty state surfaces immediately.
    this.uiState.expandProjects([project.id]);
    return project;
  }

  /**
   * Silent project bootstrap on `Open project` (P0.3 / R0.3.E). Runs the
   * full backend orchestration in one Tauri call: register the repo,
   * write `project_local_config` if there's no `.mozart/`, create the
   * first workspace + 'Start' chat, store the `system_info` entry. The
   * caller (AddProjectFlow) hydrates dependent stores and routes the
   * user into the workspace.
   */
  async bootstrap(path: string) {
    const isFirst = this.store.projects().length === 0;
    const result = await this.adapter.bootstrap(path);
    this.store.upsertProject(result.project);
    this.analytics.track('project_added', {
      is_first: isFirst,
      source: 'open',
    });
    this.uiState.expandProjects([result.project.id]);
    return result;
  }

  // Run `git init` + initial commit at `path`. Called by the
  // AddProjectFlow after the user confirms the Initialize-project
  // dialog. Does not register the project — the flow re-runs `add`
  // once initialization succeeds.
  async initRepo(path: string): Promise<void> {
    await this.adapter.initRepo(path);
  }

  // Clone the remote at `url` into `<destDir>/<derived-name>`. Returns
  // the absolute path of the cloned folder so AddProjectFlow can hand
  // it to add() afterwards.
  async cloneRepo(url: string, destDir: string): Promise<string> {
    return this.adapter.cloneRepo(url, destDir);
  }

  // Create an empty `<parent>/<name>` directory for Quick start. Returns
  // the absolute path. AddProjectFlow runs initRepo + add afterwards.
  async createProjectFolder(parent: string, name: string): Promise<string> {
    return this.adapter.createProjectFolder(parent, name);
  }

  toggleExpanded(id: string): void {
    this.uiState.toggleProjectExpanded(id);
  }
  toggleStatusCollapsed(statusId: string): void {
    this.uiState.toggleStatusCollapsed(statusId);
  }
  setHovered(id: string | null): void {
    this.store.setHovered(id);
  }
  // Group-mode aware: expand/collapse target the visible grouping
  // (status sections when groupBy === 'status', otherwise project rows).
  expandAll(): void {
    if (this.store.groupBy() === 'status') {
      this.uiState.expandAllStatuses();
    } else {
      this.uiState.setExpandedProjects(this.store.projects().map((p) => p.id));
    }
  }
  collapseAll(): void {
    if (this.store.groupBy() === 'status') {
      this.uiState.setCollapsedStatuses([...WORKSPACE_STATUS_IDS]);
    } else {
      this.uiState.collapseAllProjects();
    }
  }
  setGroupBy(group: GroupBy): void {
    this.store.setGroupBy(group);
  }
  selectAllProjects(): void {
    this.store.selectAllProjects();
  }
  toggleProjectInFilter(id: string): void {
    this.store.toggleProjectInFilter(id);
  }

  // Hide and rollback on Tauri failure. The previous .hide() left the
  // flag in memory only — restart un-hid the project.
  async hide(id: string): Promise<void> {
    const current = this.byId(id)();
    if (!current) return;
    this.store.setHidden(id, true);
    try {
      await this.adapter.setHidden(id, true);
    } catch (err) {
      this.store.setHidden(id, current.hidden);
      throw err;
    }
  }

  async unhide(id: string): Promise<void> {
    const current = this.byId(id)();
    if (!current) return;
    this.store.setHidden(id, false);
    try {
      await this.adapter.setHidden(id, false);
    } catch (err) {
      this.store.setHidden(id, current.hidden);
      throw err;
    }
  }

  async setIcon(id: string, icon: string | null): Promise<void> {
    const current = this.byId(id)();
    if (!current) return;
    this.store.setIcon(id, icon);
    try {
      await this.adapter.setIcon(id, icon);
    } catch (err) {
      this.store.setIcon(id, current.icon);
      throw err;
    }
  }

  /** Persist the project's run command. Optimistic; rolls back on
   *  Tauri failure so the UI stays consistent. */
  async setRunCommand(id: string, command: string | null): Promise<void> {
    const current = this.byId(id)();
    if (!current) return;
    const next = command && command.trim().length > 0 ? command.trim() : null;
    this.store.setRunCommand(id, next);
    try {
      await this.adapter.setRunCommand(id, next);
    } catch (err) {
      this.store.setRunCommand(id, current.runCommand);
      throw err;
    }
  }

  // Pessimistic: adapter (Tauri DB delete) first, store update second.
  // Optimistic order was unsafe for project deletion — a partial failure
  // left workspaces/tasks (wiped by the caller) inconsistent with the
  // still-present project row.
  /** Persist the project's setup/install command. Same optimistic
   *  pattern as `setRunCommand`. */
  async setSetupCommand(id: string, command: string | null): Promise<void> {
    const current = this.byId(id)();
    if (!current) return;
    const next = command && command.trim().length > 0 ? command.trim() : null;
    this.store.setSetupCommand(id, next);
    try {
      await this.adapter.setSetupCommand(id, next);
    } catch (err) {
      this.store.setSetupCommand(id, current.setupCommand);
      throw err;
    }
  }

  async remove(id: string): Promise<void> {
    await this.adapter.remove(id);
    this.store.removeProject(id);
  }

  // Optimistic reorder. Mirrors the array immediately so the drop
  // animation lands smoothly; a 250ms debounce coalesces drag bursts
  // before one Tauri write. On persistence failure the next loadAll()
  // recovers; we don't snapshot the order client-side because the
  // user has likely already moved on visually.
  reorder(prevIndex: number, currentIndex: number): void {
    this.store.reorderProjects(prevIndex, currentIndex);
    if (this.reorderTimer != null) clearTimeout(this.reorderTimer);
    this.reorderTimer = setTimeout(() => {
      this.reorderTimer = null;
      const orderedIds = this.store
        .projects()
        .filter((p) => !p.hidden)
        .map((p) => p.id);
      void this.adapter
        .setSort(orderedIds)
        .catch((err) => console.warn('persist project order failed', err));
    }, 250);
  }
}
