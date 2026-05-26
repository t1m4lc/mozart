import { InjectionToken } from '@angular/core';
import type { Project } from '@mozart/desktop-projects-util';

/** Mirror of the Rust `BootstrapResult` shape on the wire. */
export interface BootstrapResult {
  readonly project: Project;
  readonly firstWorkspaceId: string;
  readonly startChatId: string;
  /** Where the run config came from — 'repo' | 'local' | 'fallback'. */
  readonly source: string;
  /**
   * Set when the backend planted a `setup_progress` chat-timeline entry.
   * The frontend flips it to done / failed once `runInstall` resolves.
   * `null` when no setup command was detected.
   */
  readonly setupProgressMessageId: string | null;
}

// Tauri-backed IO for the projects domain. Concrete impl bound in
// app.config.ts (wraps `add_repo` / `list_repos` / mutators from
// _bindings).
export interface ProjectsAdapter {
  add(path: string): Promise<Project>;
  /**
   * Silent first-run bootstrap for `Open project`. Registers the repo
   * (idempotent), writes `project_local_config` when there's no
   * `.mozart/`, creates the first workspace + 'Start' chat, and stores a
   * one-time `system_info` entry in that chat. Returns IDs so the caller
   * can navigate straight in.
   */
  bootstrap(path: string): Promise<BootstrapResult>;
  // Runs `git init` + identity config + an initial empty commit at
  // `path`. Called after the user confirms the Initialize-project
  // dialog when add() throws NotARepo.
  initRepo(path: string): Promise<void>;
  // git clone <url> into <destDir>/<derived-name>. Returns the absolute
  // path of the cloned folder so the caller can hand it to add().
  cloneRepo(url: string, destDir: string): Promise<string>;
  // Creates an empty `<parent>/<name>` directory for Quick start.
  // Refuses if the target already exists. Returns the absolute path.
  createProjectFolder(parent: string, name: string): Promise<string>;
  list(): Promise<Project[]>;
  remove(id: string): Promise<void>;
  setIcon(id: string, icon: string | null): Promise<void>;
  setHidden(id: string, hidden: boolean): Promise<void>;
  setSort(orderedIds: readonly string[]): Promise<void>;
  /** Persist the project's run command. Pass `null` to clear. */
  setRunCommand(id: string, command: string | null): Promise<void>;
  /** Persist the project's setup/install command. Pass `null` to clear. */
  setSetupCommand(id: string, command: string | null): Promise<void>;
  /** Best-effort read of `.mozart/run.json` for the project. Returns
   *  null entries when the file is absent / malformed / missing the
   *  key. Powers the run/setup precedence rule on the frontend: a
   *  detected script enables the Run / Start setup CTAs even when the
   *  DB column is empty. */
  readDetectedScripts(id: string): Promise<DetectedScripts>;
  /** P2.6 / AD-02 — read the persisted `project_local_config.merge_mode`
   *  (`'pr'` or `'local'`). Falls back to `'pr'` if the project hasn't
   *  bootstrapped a local config yet. */
  getMergeMode(id: string): Promise<MergeMode>;
  /** P1.1 D9 — does this project's `origin` remote resolve to a
   *  github.com URL? Used by the right-aside merge action menu to
   *  differentiate "user not connected" from "this repo isn't on
   *  GitHub". Returns `false` for any non-GitHub origin AND any error
   *  reading the remote (defensive — see Rust command docs). */
  isGithubRemote(id: string): Promise<boolean>;
}

export type MergeMode = 'pr' | 'local';

/** Effective scripts parsed from a project's `.mozart/run.json`. The
 *  `setup` and `run` entries are independent — only one may be
 *  present in the file. */
export interface DetectedScripts {
  readonly setup: string | null;
  readonly run: string | null;
}

export const PROJECTS_ADAPTER = new InjectionToken<ProjectsAdapter>(
  'PROJECTS_ADAPTER',
);
