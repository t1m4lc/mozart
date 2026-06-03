// HAND-MAINTAINED CANONICAL copy of the tauri-specta TypeScript bindings.
// The regenerator (`cargo test --ignored regenerate_production_bindings`,
// defined in `apps/desktop-tauri/tests/bindings_export.rs`) writes the
// generator output to `apps/src/app/core/_bindings.ts` (gitignored per
// `.gitignore:6-7`) — NOT this file. When adding a new command, update
// this file by hand to match the generator's shape; the build still uses
// this libs/ copy as the source of truth.
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-empty-function, @typescript-eslint/no-unused-vars */

/** user-defined commands **/

export const commands = {
  async listRepos(): Promise<Result<Repo[], AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('list_repos') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async addRepo(path: string): Promise<Result<Repo, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('add_repo', { path }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Run `git init --initial-branch=main` + identity config + an initial
   * empty commit at `path` so the folder becomes a valid git repository
   * Mozart can register. Called by the frontend after the user confirms
   * the Initialize-project dialog (triggered when `add_repo` returns the
   * `NotARepo` validation error).
   */
  async initRepo(path: string): Promise<Result<null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('init_repo', { path }) };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Clone the git repository at `url` into `<dest_dir>/<name>`, where
   * `name` is derived from the URL (last `/`-segment, trailing `.git`
   * stripped). Creates `dest_dir` if it does not exist. Returns the
   * absolute path of the cloned folder so the frontend can hand it to
   * `add_repo` for registration.
   *
   * Refuses `file://` URLs (only http/https/ssh-like remote URLs are
   * allowed). Refuses if `<dest_dir>/<name>` already exists — the user
   * should pick a different location or remove the existing folder.
   */
  async cloneRepo(
    url: string,
    destDir: string,
  ): Promise<Result<string, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('clone_repo', { url, destDir }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Create an empty directory `<parent>/<name>` for a fresh "Quick start"
   * project. Validates inputs, refuses if the target already exists, and
   * returns the canonicalised absolute path so the frontend can hand it
   * to the unified add-project flow (which will trigger `git init` next).
   */
  async createProjectFolder(
    parent: string,
    name: string,
  ): Promise<Result<string, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('create_project_folder', { parent, name }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Detect the package manager for `workspace_id`'s worktree and run
   * `<manager> install`. Used by the Phase 1 add-project flow to make
   * the freshly-cloned workspace immediately usable. Non-blocking
   * from the user's perspective: the frontend fires this without
   * awaiting and toasts the outcome.
   *
   * Detection order: pnpm-lock.yaml -> yarn.lock -> package-lock.json
   * -> npm (default when package.json exists but no lockfile).
   */
  async installWorkspacePackages(
    workspaceId: string,
  ): Promise<Result<InstallResult, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('install_workspace_packages', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async removeRepo(repoId: string): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('remove_repo', { repoId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async setRepoIcon(
    repoId: string,
    icon: string | null,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_repo_icon', { repoId, icon }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async setRepoHidden(
    repoId: string,
    hidden: boolean,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_repo_hidden', { repoId, hidden }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Apply a complete project ordering. `ordered_ids[i]` gets
   * `sort_index = i`. The Angular store debounces drag bursts so this
   * fires once per drop, not per dragOver.
   */
  async setRepoSort(orderedIds: string[]): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_repo_sort', { orderedIds }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async listBranches(repoPath: string): Promise<Result<string[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_branches', { repoPath }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async createWorkspace(
    repoId: string,
    baseBranch: string,
    taskText: string,
    workspaceName: string,
  ): Promise<Result<Workspace, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('create_workspace', {
          repoId,
          baseBranch,
          taskText,
          workspaceName,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async listWorkspaces(): Promise<Result<Workspace[], AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('list_workspaces') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async listTasks(repoId: string): Promise<Result<Task[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_tasks', { repoId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async archiveWorkspace(workspaceId: string): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('archive_workspace', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Rename the user-facing workspace title. Intentionally does NOT
   * touch `branch_name` — the branch is derived from the original
   * name at create time and never re-derived (vocabulary contract).
   */
  async renameWorkspace(
    workspaceId: string,
    name: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('rename_workspace', { workspaceId, name }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Set the kanban-lane label. The backend does not validate the value
   * against an enum; the Angular side owns the closed-set of allowed
   * `UiWorkspaceStatus` strings.
   */
  async setWorkspaceUiStatus(
    workspaceId: string,
    uiStatus: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_workspace_ui_status', {
          workspaceId,
          uiStatus,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Lift a workspace out of the frozen `done` UI state so the user can
   * edit and run agents again. Flips `ui_status` to the caller-chosen
   * `target_ui_status` (the user's pick from the status menu) and
   * resets the runtime `status` to `ready`. Returns `Validation` if the
   * workspace isn't currently frozen, or if the target is itself
   * `done` (that would be a no-op pretending to be a reopen).
   */
  async reopenWorkspace(
    workspaceId: string,
    targetUiStatus: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('reopen_workspace', {
          workspaceId,
          targetUiStatus,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async setWorkspacePinned(
    workspaceId: string,
    pinned: boolean,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_workspace_pinned', {
          workspaceId,
          pinned,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async setWorkspaceUnread(
    workspaceId: string,
    unread: boolean,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_workspace_unread', {
          workspaceId,
          unread,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async startAgentRun(
    workspaceId: string,
    chatId: string,
    currentUserMessageId: string,
    mode: string,
    provider: string,
    model: string | null,
    onEvent: TAURI_CHANNEL<StreamEvent>,
  ): Promise<Result<AgentRun, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('start_agent_run', {
          workspaceId,
          chatId,
          currentUserMessageId,
          mode,
          provider,
          model,
          onEvent,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async stopAgentRun(runId: string): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('stop_agent_run', { runId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async listRuns(workspaceId: string): Promise<Result<AgentRun[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_runs', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async getWorkspaceDiff(
    workspaceId: string,
  ): Promise<Result<WorkspaceChange | null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('get_workspace_diff', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async listWorkspaceDiffStats(): Promise<
    Result<WorkspaceDiffStats[], AppError>
  > {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_workspace_diff_stats'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * "Undo the last agent run." Resets the worktree to the most-recent
   * `agent_runs.checkpoint_sha` for this workspace's thread. Only the
   * latest run's diff is reverted; earlier-run diffs that were never
   * committed upstream stay in the worktree. With no prior run that
   * captured a checkpoint, returns `AppError::Validation` (UI shows a
   * friendly "nothing to discard" toast). For the v0.1.0-beta.1 single-decision
   * flow (one run per archive/discard cycle) this matches the user's
   * mental model.
   */
  async discardWorkspaceChanges(
    workspaceId: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('discard_workspace_changes', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async listChats(workspaceId: string): Promise<Result<Chat[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_chats', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * All open chats across every workspace, newest first. Backs the
   * Phase 1 sidebar "Chats" group.
   */
  async listAllChats(): Promise<Result<Chat[], AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('list_all_chats') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async createChat(
    workspaceId: string,
    title: string,
    llmId: string | null,
  ): Promise<Result<Chat, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('create_chat', { workspaceId, title, llmId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async renameChat(
    chatId: string,
    title: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('rename_chat', { chatId, title }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async closeChat(chatId: string): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('close_chat', { chatId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async getActiveChat(
    workspaceId: string,
  ): Promise<Result<string | null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('get_active_chat', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async setActiveChat(
    workspaceId: string,
    chatId: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_active_chat', { workspaceId, chatId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async updateChatMode(
    chatId: string,
    mode: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('update_chat_mode', { chatId, mode }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async updateChatEffort(
    chatId: string,
    effort: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('update_chat_effort', { chatId, effort }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async updateChatModel(
    chatId: string,
    llmId: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('update_chat_model', { chatId, llmId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async markChatRead(
    chatId: string,
    messageId: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('mark_chat_read', { chatId, messageId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async listMessages(chatId: string): Promise<Result<Message[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_messages', { chatId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Inserts a message and returns the canonical row. Angular passes a
   * pre-generated `message_id` so optimistic UI can swap by ID without
   * a round-trip ambiguity.
   */
  async insertMessage(
    messageId: string,
    chatId: string,
    role: string,
    content: string,
    mode: string | null,
    status: string,
    runId: string | null,
    timelineJson: string | null,
  ): Promise<Result<Message, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('insert_message', {
          messageId,
          chatId,
          role,
          content,
          mode,
          status,
          runId,
          timelineJson,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async updateMessageContent(
    messageId: string,
    content: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('update_message_content', {
          messageId,
          content,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async updateMessageStatus(
    messageId: string,
    status: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('update_message_status', {
          messageId,
          status,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async updateMessageTimeline(
    messageId: string,
    timelineJson: string | null,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('update_message_timeline', {
          messageId,
          timelineJson,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async checkClaudeInstall(): Promise<ClaudeInstall> {
    return await TAURI_INVOKE('check_claude_install');
  },
  /**
   * Step 6d — heuristic probe for an existing `claude /login` session. The
   * frontend uses this to give Pro/Max users a single-click "Connect"
   * experience that bypasses the API-key dialog when their CLI is already
   * authenticated.
   */
  async checkClaudeCodeSession(): Promise<boolean> {
    return await TAURI_INVOKE('check_claude_code_session');
  },
  /**
   * Step 6 — cheap presence check used by the frontend on app start to know
   * whether to render "Not connected" immediately or to kick off a probe.
   * Never returns the value of the key.
   */
  async hasAnthropicKey(): Promise<Result<boolean, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('has_anthropic_key') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Step 6 — probe-then-persist. Only writes to the keyring when the probe
   * returns `Connected`. On `Invalid` / `NetworkError` the key is dropped at
   * the end of this function frame and never touches disk. The argument
   * `key` is the only place the value is ever passed by-value into Mozart
   * from the frontend.
   */
  async connectAnthropic(key: string): Promise<Result<ProbeResult, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('connect_anthropic', { key }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Step 6 — idempotent removal of the stored key. Safe to call when no
   * entry exists.
   */
  async disconnectAnthropic(): Promise<Result<null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('disconnect_anthropic') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Step 6 — re-probe the currently stored key. Returns `Validation` when no
   * key is stored (the frontend gates this call on `has_anthropic_key()` so
   * the error path is only hit on misuse).
   */
  async refreshAnthropicConnection(): Promise<Result<ProbeResult, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('refresh_anthropic_connection'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /** Probe for the `codex` CLI by running `codex --version`. */
  async checkCodexInstall(): Promise<ClaudeInstall> {
    return await TAURI_INVOKE('check_codex_install');
  },
  /** Heuristic probe for an existing `codex login` session. */
  async checkCodexSession(): Promise<boolean> {
    return await TAURI_INVOKE('check_codex_session');
  },
  /** Cheap presence check for a stored OpenAI key. Never returns the value. */
  async hasOpenaiKey(): Promise<Result<boolean, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('has_openai_key') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /** Probe-then-persist an OpenAI key. Only writes to the keyring on `Connected`. */
  async connectOpenai(key: string): Promise<Result<ProbeResult, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('connect_openai', { key }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /** Idempotent removal of the stored OpenAI key. */
  async disconnectOpenai(): Promise<Result<null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('disconnect_openai') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /** Re-probe the currently stored OpenAI key. */
  async refreshOpenaiConnection(): Promise<Result<ProbeResult, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('refresh_openai_connection'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Keyless reachability check polled by the front-end ConnectivityService.
   * Owned by Rust so a non-200 HTTP response (e.g. 404 on `HEAD /`) does not
   * surface as a noisy "Failed to load resource" line in DevTools.
   */
  async probeAnthropicReachability(): Promise<boolean> {
    return await TAURI_INVOKE('probe_anthropic_reachability');
  },
  /**
   * List the workspace's worktree contents as a nested file tree, with
   * per-file change badges (`A` / `M` / `D`) computed against the
   * workspace's `base_branch`.
   *
   * `show_ignored=false` filters via `.gitignore` (ripgrep walker).
   * `show_ignored=true` walks everything except `.git/` and tags entries
   * with the `ignored` flag so the UI can mute them.
   */
  async listRepositoryTree(
    workspaceId: string,
    showIgnored: boolean,
  ): Promise<Result<FileNodeDto[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_repository_tree', {
          workspaceId,
          showIgnored,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Subscribe to FS-change events for the workspace's worktree. Spawns
   * a `notify-debouncer-mini` watcher (200ms window) and registers it
   * keyed by `workspace_id` so a subsequent call for the same workspace
   * replaces the previous watcher.
   */
  async watchRepositoryTree(
    workspaceId: string,
    onEvent: TAURI_CHANNEL<FileTreeEvent>,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('watch_repository_tree', {
          workspaceId,
          onEvent,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Cancel the active watcher for `workspace_id`, if any. No-op if the
   * workspace has no active watcher.
   */
  async unwatchRepositoryTree(
    workspaceId: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('unwatch_repository_tree', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Resolve the unified diff text for one file in a workspace, against
   * the workspace's `base_branch`. Working tree (incl. staged + unstaged)
   * vs. base. Untracked files surface as a synthesized "all-added" diff;
   * unchanged files return an empty string (caller renders "No changes.").
   */
  async getFileDiff(
    workspaceId: string,
    path: string,
  ): Promise<Result<string, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('get_file_diff', { workspaceId, path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Read a file's raw contents from a workspace's worktree. Used by the
   * markdown preview, the CodeMirror Edit pane (P2.1) and any other
   * component that needs file content rather than a diff. Path validation
   * goes through `path_guard::guard_agent_relative_path` so the read,
   * save, diff, and staging paths all share the same sandbox check
   * and cannot drift.
   */
  async readWorkspaceFile(
    workspaceId: string,
    path: string,
  ): Promise<Result<string, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('read_workspace_file', { workspaceId, path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Write a file in the workspace's worktree. Used by the CodeMirror Edit
   * pane (P2.1) for an explicit Save action.
   *
   * Contract:
   * - `expected_hash` = sha256 of the buffer the editor last loaded /
   * saved. The command computes the current on-disk hash and rejects
   * with `AppError::StaleFile(path)` if they diverge — the file changed
   * under us, the editor must reload or discard.
   * - `AppError::Frozen` when the workspace is in the closed UI state
   * (`done` / `canceled`) — Save must be blocked, [§P0.2 freeze].
   * - UTF-8 text only. Binary / non-UTF-8 editing is out of scope for
   * P2.1.
   * - Atomic: writes to `<path>.mozart-tmp-<rand>` next to the target
   * and renames it into place so a torn write can never leave a half
   * file on disk.
   */
  async fileSave(
    workspaceId: string,
    path: string,
    content: string,
    expectedHash: string,
  ): Promise<Result<string, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('file_save', {
          workspaceId,
          path,
          content,
          expectedHash,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Open (or replace) the PTY for a workspace, rooted at its worktree.
   * Streams `TerminalEvent` chunks through `on_event`. Replacement
   * semantics: any prior PTY for the same workspace is killed before
   * the new one spawns. The Angular `TerminalRegistry` guarantees one
   * call per workspace per app session in normal flow; the replacement
   * path is a safety net for hot-reload + error recovery.
   */
  async openTerminal(
    workspaceId: string,
    cols: number,
    rows: number,
    onEvent: TAURI_CHANNEL<TerminalEvent>,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('open_terminal', {
          workspaceId,
          cols,
          rows,
          onEvent,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Forward bytes (typed by the user via xterm.js) to the PTY's stdin.
   * Plan P0.2 — refuses on frozen workspaces. The xterm frontend also
   * sets `disableStdin = true` when frozen, so this should rarely fire;
   * the guard is defense-in-depth for any caller bypassing the UI.
   */
  async writeTerminal(
    workspaceId: string,
    data: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('write_terminal', { workspaceId, data }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Resize the PTY to match xterm.js' viewport. Called on container
   * resize (debounced front-end side).
   */
  async resizeTerminal(
    workspaceId: string,
    cols: number,
    rows: number,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('resize_terminal', {
          workspaceId,
          cols,
          rows,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Close the PTY (kill the child + drop the master). No-op if no PTY
   * is registered for the workspace.
   */
  async closeTerminal(workspaceId: string): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('close_terminal', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Update the project's `run_command`. Pass `None` to clear it.
   */
  async setRepoRunCommand(
    repoId: string,
    command: string | null,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_repo_run_command', { repoId, command }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Update the project's `setup_command`. Pass `None` to clear it.
   * Setup command is the "install / prepare" half of the per-project
   * runner pair (e.g. `pnpm install`). Mirrors `set_repo_run_command`.
   */
  async setRepoSetupCommand(
    repoId: string,
    command: string | null,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_repo_setup_command', { repoId, command }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Spawn the project's `run_command` in a PTY rooted at the workspace's
   * worktree. Streams output through `on_event`. Replaces any prior run
   * PTY for the same workspace (the previous run is killed). Returns
   * `Validation` if neither `.mozart/run.json scripts.run` nor
   * `repos.run_command` is set.
   */
  async startWorkspaceRun(
    workspaceId: string,
    cols: number,
    rows: number,
    onEvent: TAURI_CHANNEL<TerminalEvent>,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('start_workspace_run', {
          workspaceId,
          cols,
          rows,
          onEvent,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Spawn the project's `setup_command` (install / prepare) in a PTY
   * rooted at the workspace's worktree. Same lifecycle as
   * `start_workspace_run` — replaces any prior PTY for the workspace.
   * Reads `.mozart/run.json scripts.setup` with `repos.setup_command`
   * as a fallback.
   */
  async startWorkspaceSetup(
    workspaceId: string,
    cols: number,
    rows: number,
    onEvent: TAURI_CHANNEL<TerminalEvent>,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('start_workspace_setup', {
          workspaceId,
          cols,
          rows,
          onEvent,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Stop the workspace's run (kill the child, drop the PTY).
   */
  async stopWorkspaceRun(workspaceId: string): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('stop_workspace_run', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Probe `$PATH` for known IDE binaries. The list is ordered as in
   * `KNOWN_IDES`. Front-end uses this to filter the static
   * `OPEN_IN_TOOLS` array.
   */
  async detectInstalledIdes(): Promise<Result<DetectedIde[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('detect_installed_ides'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Launch `id` (e.g. `"vscode"`, `"cursor"`, `"finder"`) against the
   * workspace's worktree. The path is resolved server-side from the
   * workspace_id; the front-end never sees it.
   */
  async openInIde(
    workspaceId: string,
    ideId: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('open_in_ide', { workspaceId, ideId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Flat list of changed files in the workspace's worktree. Powers the
   * commit dialog's checkbox list.
   */
  async listChangedFiles(
    workspaceId: string,
  ): Promise<Result<ChangedFile[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_changed_files', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * All files changed on the workspace branch vs its base branch, including
   * committed changes. Powers the Changes tab in the right aside.
   */
  async listBranchDiffFiles(
    workspaceId: string,
  ): Promise<Result<ChangedFile[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_branch_diff_files', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Files committed on the workspace branch since it diverged from its base
   * branch (`base...HEAD`). Working-tree edits are excluded. Powers the
   * "Committed" section of the Changes tab in the right aside.
   */
  async listCommittedFiles(
    workspaceId: string,
  ): Promise<Result<ChangedFile[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_committed_files', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Stage `paths` and create a commit with `message`. Returns the new
   * commit's sha. Refuses on empty path list / empty message.
   */
  async commitWorkspace(
    workspaceId: string,
    paths: string[],
    message: string,
  ): Promise<Result<string, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('commit_workspace', {
          workspaceId,
          paths,
          message,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * `git add -- <path>` inside the workspace's worktree. P0.1 S0.1.D —
   * gated by `path_guard::guard_agent_relative_path` so a symlink-escape
   * commit can't slip through staging.
   */
  async stageFile(
    workspaceId: string,
    path: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('stage_file', { workspaceId, path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * `git reset HEAD -- <path>` inside the workspace's worktree. Leaves
   * the working-tree copy untouched. P0.1 S0.1.D — same gate as
   * `stage_file`.
   */
  async unstageFile(
    workspaceId: string,
    path: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('unstage_file', { workspaceId, path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * `true` when the path has changes in the git index (X byte of
   * porcelain status is non-space, non-`?`). P0.1 S0.1.D — same gate.
   */
  async isStaged(
    workspaceId: string,
    path: string,
  ): Promise<Result<boolean, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('is_staged', { workspaceId, path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Mark a file viewed. Explicit reviewer action only — opening a file
   * never calls this. Idempotent: re-marking refreshes `viewed_at` and
   * `viewed_at_hash` to the current on-disk hash, clearing any
   * `changed_since_viewed` state.
   */
  async markFileViewed(
    workspaceId: string,
    path: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('mark_file_viewed', { workspaceId, path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Drop the Viewed mark for a single file. Used by the discard flow
   * and by an explicit "Mark unviewed" toolbar action. No-op when the
   * file was never viewed.
   */
  async clearFileView(
    workspaceId: string,
    path: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('clear_file_view', { workspaceId, path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Return the per-file Viewed status for every file that currently
   * has a stored mark in this workspace. Each entry is either
   * `viewed` (stored hash matches current on-disk hash) or
   * `changed_since_viewed` (mismatch — agent or user edit since the
   * mark). The frontend overlays this on its own changed-files list to
   * derive the four-way `not_viewed | viewed | changed_since_viewed |
   * staged` decoration described in `[[mozart-viewed-principle]]`.
   */
  async listFileViews(
    workspaceId: string,
  ): Promise<Result<FileViewStatus[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_file_views', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Bulk "Mark all viewed" — marks every currently changed file viewed
   * with its current on-disk hash. Used by the dense Changes-tab summary
   * to close out a review in one click. Re-running the agent and
   * modifying any of these files flips them back to
   * `changed_since_viewed` via the normal hash comparison in
   * `list_file_views`.
   */
  async markAllViewed(workspaceId: string): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('mark_all_viewed', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async hasGithubToken(): Promise<Result<boolean, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('has_github_token') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Probe the token via `GET /user`; on success store it in the
   * keyring (marked as a PAT) and return the resolved login. Failure
   * leaves the keyring untouched.
   */
  async connectGithub(
    token: string,
  ): Promise<Result<GithubProbeResult, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('connect_github', { token }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Fetch the user's GitHub OAuth access token from `{WEB_BASE_URL}/api/github/oauth-token`
   * (which calls Clerk's Backend SDK with our Mozart-side secret key)
   * using the Clerk session JWT already stored on the desktop. The token
   * is probed via `GET /user` for defense-in-depth, then persisted in
   * the keyring marked with `GithubTokenKind::OauthClerk`.
   *
   * Reshapes the backend's discriminated union into the existing
   * `GithubProbeResult` so the TS facade can treat OAuth-acquired and
   * PAT-acquired connects through one code path.
   */
  async connectGithubViaClerk(): Promise<Result<GithubProbeResult, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('connect_github_via_clerk'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async getGithubTokenKind(): Promise<
    Result<GithubTokenKindDto | null, AppError>
  > {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('get_github_token_kind'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * List up to 100 GitHub repos visible to the user's Clerk-linked
   * GitHub account, sorted by recent activity. Used by the clone-repo
   * dialog to render an autocomplete list. Does NOT require a GitHub
   * token to be stored in the keyring — the listing goes through the
   * same `/api/github/oauth-token`-style backend path with the Clerk
   * session JWT.
   */
  async listClerkGithubRepos(): Promise<Result<ClerkGithubRepo[], AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('list_clerk_github_repos'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async disconnectGithub(): Promise<Result<null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('disconnect_github') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * P1.1 D9 — does this project's `origin` remote resolve to a github.com
   * URL? Used by the right-aside merge action menu to disable the
   * Create PR action with a "this repo isn't on GitHub" tooltip when
   * the workspace's project doesn't have a GitHub remote. The check is
   * project-level (not workspace-level) because git remotes are shared
   * across all worktrees of the same repo.
   *
   * Returns a typed `GithubRemoteStatus` so the UI can tell "no remote",
   * "non-GitHub remote", and "couldn't read remotes" apart — the old
   * bare-bool collapsed all three into a misleading "GitHub not found".
   */
  async detectGithubRemoteForProject(
    repoId: string,
  ): Promise<Result<GithubRemoteStatus, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('detect_github_remote_for_project', { repoId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Push the workspace's branch to `origin` (with `-u`) using the local
   * git binary. Resolves the origin URL via `git remote get-url origin`.
   * Surfaces `Validation` if no `origin` is set.
   */
  async pushWorkspaceBranch(
    workspaceId: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('push_workspace_branch', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Push the branch (idempotent) then create a PR via the GitHub REST
   * API. Requires a stored GitHub token; the project's origin must
   * resolve to `github.com/<owner>/<repo>`.
   */
  async createWorkspacePr(
    workspaceId: string,
    title: string,
    body: string,
    draft: boolean,
  ): Promise<Result<CreatedPr, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('create_workspace_pr', {
          workspaceId,
          title,
          body,
          draft,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Open `path` in the OS file manager (Finder / Explorer / the default
   * xdg file manager). Backs the source-repo crumb's "Open local folder".
   */
  async openPathInFileManager(path: string): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('open_path_in_file_manager', { path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Plan §P2.6 "Merge-now flow". Runs the local-merge state machine on
   * the workspace's worktree and persists the resulting status.
   *
   * Returns:
   * - `MergeOutcome { status: "done", conflicting_files: [] }` and flips
   * `workspace.ui_status = 'done'` so P0.2 freeze takes over.
   * - `MergeOutcome { status: "conflict", conflicting_files: […] }` and
   * flips `workspace.status = 'conflict'`. The worktree is left
   * mid-merge for the user to resolve in their IDE.
   *
   * Surfaces typed precondition failures as `AppError`:
   * - `MergeDirtyTree` → frontend toast "Commit your changes before merging."
   * - `MergeBaseAhead(base)` → frontend toast "Pull <base> first."
   */
  async mergeWorkspaceLocally(
    workspaceId: string,
  ): Promise<Result<MergeOutcome, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('merge_workspace_locally', { workspaceId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Persist the workspace's last merge-action choice (`'pr'` or `'local'`).
   * The right-aside primary-button label routes off this column with
   * `project_local_config.merge_mode` as the fallback. Fires on every
   * click of either dropdown option — outcome-independent, mirroring the
   * existing Open-in-IDE last-used pattern (AD-02).
   */
  async setWorkspaceLastMergeAction(
    workspaceId: string,
    action: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_workspace_last_merge_action', {
          workspaceId,
          action,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Change a workspace's [`SandboxLevel`]. Validated against
   * `SandboxLevel::from_str` before writing — an unknown string
   * surfaces as `AppError::Validation` rather than silently widening
   * the agent's reach via a bogus DB row.
   *
   * **No UI in v0.** The toggle UI ships with the Security settings
   * panel (TODO-008). For now this command is reachable only via the
   * devtools (`__TAURI__.invoke('set_workspace_sandbox_level', …)`) and
   * from E2E tests; that's intentional per /plan-devex-review
   * 2026-05-19 (first-run users have no context to interpret a
   * "Mozart-wide / project / workspace-only" choice without a security
   * surface around it).
   */
  async setWorkspaceSandboxLevel(
    workspaceId: string,
    level: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_workspace_sandbox_level', {
          workspaceId,
          level,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 5 / Atom 3 — load the persisted Mozart auth session from the
   * OS keyring. Returns `None` when no entry exists OR when the stored
   * payload is malformed (defensive : the front-end falls back to the
   * /welcome route and asks the user to re-authenticate).
   */
  async authLoadSession(): Promise<Result<AuthSessionDto | null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('auth_load_session') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 5 / Atom 3 — persist `session` to the OS keyring. Overwrites
   * any prior entry.
   */
  async authSaveSession(
    session: AuthSessionDto,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('auth_save_session', { session }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 5 / Atom 3 — idempotent removal of the stored session. Safe to
   * call when no entry exists.
   */
  async authClearSession(): Promise<Result<null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('auth_clear_session') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 5 follow-up — port of the localhost HTTP callback server
   * started in `lib.rs::setup`. The TS adapter reads this once at
   * bootstrap and embeds it in the apps/web sign-in URL so the
   * browser-side `fetch(http://127.0.0.1:<port>/auth)` knows where to
   * call. Returns `0` if the bind failed at boot (in which case the
   * HTTP transport is non-functional and the apps/web UI surfaces a
   * "Mozart isn't running" message — fail-closed, not fail-quiet).
   */
  async authGetCallbackPort(): Promise<number> {
    return await TAURI_INVOKE('auth_get_callback_port');
  },
  /**
   * Phase 6 / Atom 1 — read the local onboarding-completed mirror from the
   * `config` key-value table. Missing row fails-closed to `false` so a
   * brand-new install routes into the wizard.
   *
   * Source-of-truth contract : the JWT carries an `onboarding` claim that
   * seeds initial routing on first sign-in (Atom 0). This local mirror
   * then takes over on every restart so the user doesn't re-onboard if
   * the mock-Clerk token resets the claim.
   */
  async getOnboardingCompleted(): Promise<Result<boolean, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('get_onboarding_completed'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 6 / Atom 1 — write the onboarding-completed flag. Called by the
   * onboarding facade when the user finishes step 4, and from settings'
   * "Revisit tour" (passes `false` to gate the wizard again).
   */
  async setOnboardingCompleted(
    value: boolean,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_onboarding_completed', { value }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 6 / Atom 2 — detection probe for the onboarding wizard's Git
   * step. Spawns `git --version` (argv form, no shell) and parses the
   * stdout line `git version X.Y.Z`. Returns `None` when the binary is
   * not on PATH or the invocation fails. UI shows ✅ X.Y.Z or ❌ Not
   * found with OS-specific install copy.
   */
  async gitVersion(): Promise<Result<string | null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('git_version') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async gitIdentity(): Promise<Result<GitIdentity | null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('git_identity') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 6 / Atom 3 — spawn `claude login` in a PTY rooted at the user's
   * HOME so the embedded xterm in the onboarding wizard can drive the
   * CLI's URL-paste flow. Returns the synthetic terminal id the JS side
   * uses for subsequent write/resize/close calls (the existing
   * `write_terminal`/`resize_terminal`/`close_terminal` commands are
   * key-by-string and work against this synthetic id).
   *
   * We deliberately reuse `terminal::spawn_command` rather than introduce
   * a parallel PTY path : Phase 4's terminal_registry is the canonical
   * PTY infrastructure ; sharing it keeps lifecycle (Drop kills child,
   * kills master on registry.cancel) consistent.
   *
   * Exit-code semantics : the terminal reader emits `Exited { code: 0 }`
   * unconditionally on EOF (see `terminal::spawn_inner`) — that's fine,
   * the front-end re-probes `claude_cli::session::has_session()` (via
   * the existing `check_claude_code_session` command) after the Exited
   * event arrives, which is the authoritative success signal.
   */
  async spawnClaudeLogin(
    cols: number,
    rows: number,
    onEvent: TAURI_CHANNEL<TerminalEvent>,
  ): Promise<Result<string, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('spawn_claude_login', { cols, rows, onEvent }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /** Runs `codex login` in the shared onboarding PTY. Mirrors spawnClaudeLogin. */
  async spawnCodexLogin(
    cols: number,
    rows: number,
    onEvent: TAURI_CHANNEL<TerminalEvent>,
  ): Promise<Result<string, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('spawn_codex_login', { cols, rows, onEvent }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Materialize (if missing) the bundled `~/Mozart/get-started/` project,
   * then ensure a `welcome-1` workspace exists on `main`. Idempotent —
   * re-entry from Settings → "Revisit tour" reuses the existing repo +
   * workspace instead of duplicating either.
   */
  async createGetStartedProject(): Promise<
    Result<GetStartedProject, AppError>
  > {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('create_get_started_project'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 6 / Atom 10 — read notification preferences from the config
   * table. Both toggles default to `true` on a fresh install.
   */
  async getNotificationPreferences(): Promise<
    Result<NotificationPreferences, AppError>
  > {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('get_notification_preferences'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 6 / Atom 10 — persist notification preferences. Settings UI
   * calls this on every toggle.
   */
  async setNotificationPreferences(
    prefs: NotificationPreferences,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('set_notification_preferences', { prefs }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Phase 6 / Atom 10 — surface a desktop notification when an agent
   * turn finishes on a chat the user isn't currently looking at. The
   * front-end decides when to call this (workspace unfocused / window
   * unfocused) ; the Rust side only enforces the user's pref toggle so
   * a stale call after toggle-off is still suppressed.
   */
  async emitMessageEndNotification(
    chatTitle: string,
  ): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('emit_message_end_notification', {
          chatTitle,
        }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async playChime(): Promise<Result<null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('play_chime') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Probe a project directory and return what Mozart inferred. Pure read,
   * no DB writes. Used by `bootstrap_project` internally and by future
   * "rescan" surfaces. Returns the flat summary the UI consumes — the
   * internal `ProjectDetection` (with the full ordered `RunConfig`) stays
   * crate-private.
   */
  async detectProject(
    path: string,
  ): Promise<Result<DetectedSummary, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('detect_project', { path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Silent first-run bootstrap. Creates the project row (idempotent),
   * writes a `project_local_config` row if there's no `.mozart/`, creates
   * the first workspace, and creates the "Start" chat. Returns IDs +
   * detection so the UI can navigate directly into the workspace.
   */
  async bootstrapProject(
    path: string,
  ): Promise<Result<BootstrapResult, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('bootstrap_project', { path }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Read the active project config. Repo > local; falls back to the
   * local DB row if `.mozart/run.json` is absent. Bootstrap guarantees
   * at least one of the two sources exists.
   */
  async readProjectConfig(
    projectId: string,
  ): Promise<Result<ProjectConfig, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('read_project_config', { projectId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Effective settings (bundled defaults <- global file <- project file).
   * `projectId` selects the project whose `.mozart/settings.json` applies;
   * `null` resolves defaults <- global only.
   */
  async getResolvedSettings(
    projectId: string | null,
  ): Promise<Result<SettingsDto, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('get_resolved_settings', { projectId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async resolveWorkspaceCommands(
    repoId: string,
  ): Promise<Result<ResolvedCommands, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('resolve_workspace_commands', { repoId }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  /**
   * Persist the editable global settings file. Preference fields come from
   * the DTO; any `scripts` already in the global file are preserved.
   */
  async saveGlobalSettings(dto: SettingsDto): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('save_global_settings', { dto }),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async resetDatabaseClean(): Promise<Result<null, AppError>> {
    try {
      return { status: 'ok', data: await TAURI_INVOKE('reset_database_clean') };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
  async resetDatabaseWithDemoSeed(): Promise<Result<null, AppError>> {
    try {
      return {
        status: 'ok',
        data: await TAURI_INVOKE('reset_database_with_demo_seed'),
      };
    } catch (e) {
      if (e instanceof Error) throw e;
      else return { status: 'error', error: e as any };
    }
  },
};

/** user-defined events **/

export const events = __makeEvents__<{
  agentRunTerminated: AgentRunTerminated;
  deepLinkReceived: DeepLinkReceived;
}>({
  agentRunTerminated: 'agent-run-terminated',
  deepLinkReceived: 'deep-link-received',
});

/** user-defined constants **/

/** user-defined types **/

export type AgentRun = {
  run_id: string;
  thread_id: string;
  prompt: string;
  status: string;
  started_at: number;
  ended_at: number | null;
  exit_code: number | null;
  error_message: string | null;
  checkpoint_sha: string | null;
  /**
   * ContextCompiler v1 D5 — distinguishes pre-fix rows from
   * post-fix rows. `'frontend_collapsed'` (migration 011 default)
   * = `lastUserPrompt` from the Angular store; `'message_content'`
   * = `messages.content` looked up by `current_user_message_id`
   * (the source of truth post-T5). Audit tooling reads this column
   * to interpret old `agent_runs.prompt` values correctly.
   */
  prompt_source: string;
};
/**
 * Fired once per `agent_runs` row when the supervisor task reaches a
 * terminal status (`done`, `error`, `stopped`, `crashed`). Front-end
 * consumers filter by `run_id` to learn when the channel stream is
 * safe to complete (Q2 — no polling).
 *
 * This is the **only** tauri-specta event in v0.1.0-beta.1. The Rust crate
 * emits via `tauri_specta::Event::emit` on the `AppHandle`; the
 * Angular `_bindings.ts` surfaces it as `events.agentRunTerminated`.
 */
export type AgentRunTerminated = {
  run_id: string;
  status: string;
  /**
   * P2.7 — the workspace whose supervisor task reached this terminal
   * status. The Changes-tab auto-route filters on this field so a
   * background run for workspace A doesn't yank the user's view in
   * workspace B.
   */
  workspace_id: string;
};
export type AppError =
  | { kind: 'Db'; message: string }
  | { kind: 'Io'; message: string }
  | { kind: 'NotFound'; message: string }
  | { kind: 'Validation'; message: string }
  | { kind: 'AgentSpawn'; message: string }
  | { kind: 'GitCmd'; message: string }
  | { kind: 'Frozen'; message: string }
  | { kind: 'MergeDirtyTree'; message: string }
  | { kind: 'MergeBaseAhead'; message: string }
  | { kind: 'StaleFile'; message: string }
  | { kind: 'PathRefused'; message: string }
  | { kind: 'ContextLoad'; message: string };
/**
 * Wire shape persisted in the OS keyring (JSON-encoded). The `Date`
 * fields are normalized to epoch-ms numbers on the Angular side so the
 * JSON stays stable.
 */
export type AuthSessionDto = {
  token: string;
  /**
   * Epoch milliseconds when the underlying Clerk JWT expires.
   */
  expires_at: number;
};
/**
 * Result of a successful bootstrap. Maps to the JSON returned by the
 * `bootstrap_project` Tauri command.
 */
export type BootstrapResult = {
  projectId: string;
  firstWorkspaceId: string;
  startChatId: string;
  /**
   * Where the run config came from:
   * - `"repo"`:     `.mozart/run.json` was present, valid, and read.
   * - `"local"`:    Inferred and written to `project_local_config`.
   * - `"fallback"`: No probe matched; an empty row was still written
   * so callers always find a config.
   */
  source: string;
  detected: DetectedSummary;
  /**
   * If detection produced a setup command, bootstrap also writes a
   * `setup_progress` timeline entry in the running state. The frontend
   * transitions this entry to `done` / `failed` after `runInstall`
   * resolves. `None` when no setup command was detected.
   */
  setupProgressMessageId: string | null;
};
export type ChangedFile = {
  path: string;
  /**
   * `"added" | "modified" | "deleted"`. Untracked files surface as
   * "added" so the dialog presents them uniformly.
   */
  status: string;
  /**
   * `true` when the file has changes in git's index — derived from
   * the X byte of `git status --porcelain=v1`. The Changes pane in
   * the right aside splits on this: staged files surface in a
   * separate group from unstaged worktree changes.
   */
  staged: boolean;
  /**
   * Added lines vs. `HEAD` (working tree + staged combined). For
   * untracked files this is the file's own line count. `0` for
   * pure deletions and binary diffs.
   */
  added?: number;
  /**
   * Removed lines vs. `HEAD`. `0` for untracked / binary diffs.
   */
  removed?: number;
  /**
   * P2.6.D — `true` when the file is in git's unmerged state
   * (`git diff --name-only --diff-filter=U` lists it). The Changes
   * tab paints these rows with a red conflict badge while the
   * worktree sits mid-merge.
   */
  has_conflict?: boolean;
};
export type Chat = {
  chat_id: string;
  workspace_id: string;
  title: string;
  llm_id: string | null;
  mode: string;
  effort: string;
  last_read_message_id: string | null;
  closed_at: number | null;
  created_at: number;
};
/**
 * Outcome of probing for the `claude` CLI.
 */
export type ClaudeInstall =
  | { kind: 'installed'; version: string }
  | { kind: 'missing' };
/**
 * Outcome of `POST /repos/{owner}/{repo}/pulls`.
 */
export type CreatedPr = { number: number; html_url: string };
/**
 * Typed event fired when the OS hands a `mozart://...` URL to the
 * running desktop app. The Angular `tauriAuthAdapter` listens via
 * `events.deepLinkReceived.listen(...)`. Extracting `token` and
 * `state` from the URL is the TS side's responsibility (pure
 * `parseDeepLink` helper) — the Rust side stays vocabulary-thin.
 */
export type DeepLinkReceived = { url: string };
export type DetectedIde = {
  /**
   * Stable identifier (e.g. `"vscode"`).
   */
  id: string;
  /**
   * Resolved absolute binary path (informational).
   */
  binary_path: string;
};
/**
 * Flattened detection summary for the UI surface. The internal
 * `ProjectDetection` keeps the full ordered `RunConfig`; this DTO
 * reduces it to the two strings the system_info bullet renders.
 */
export type DetectedSummary = {
  setup: string | null;
  run: string | null;
  /**
   * Toolchain name from the winning probe (`"pnpm"`, `"cargo"`, ...).
   * `None` when no probe matched.
   */
  stack: string | null;
  hasMozartDir: boolean;
};
/**
 * Wire shape consumed by the Angular `RepositoriesAdapter`. Names are
 * snake_case on the wire; the TS side maps to camelCase via
 * `fileNodeFromDto`.
 */
export type FileNodeDto = {
  /**
   * Workspace-relative path, forward-slash separated. Empty for the
   * (synthetic) root — never emitted: `list_tree` returns the root's
   * children directly.
   */
  path: string;
  name: string;
  /**
   * `"file"` or `"directory"`.
   */
  kind: string;
  /**
   * `"added" | "modified" | "deleted" | "unchanged"`.
   */
  status: string;
  /**
   * True if the entry is matched by `.gitignore`. When
   * `show_ignored=false` the entry would not be emitted, so this is
   * false for every node returned in that mode.
   */
  ignored: boolean;
  /**
   * `Some(children)` for directories (possibly empty). `None` for files.
   */
  children: FileNodeDto[] | null;
  /**
   * Added lines vs. the workspace's base branch (staged + working
   * tree combined). `None` for unchanged files and directories. UI
   * surfaces as a green `+N` chip when present.
   */
  added?: number | null;
  /**
   * Removed lines vs. base. `None` for unchanged / directories.
   */
  removed?: number | null;
};
/**
 * Wire event payload pushed by `watch_repository_tree`. v0.1.0-beta.1 emits a
 * single variant — the front-end re-fetches on every ping.
 */
export type FileTreeEvent = { kind: 'changed' };
/**
 * State of a single file relative to its stored Viewed mark. The
 * frontend uses this to decorate Changes-tab rows and to drive the
 * `mz-review-progress` summary. `not_viewed` is implicit (no row in
 * the table) and never returned by this surface — the Changes-tab
 * renderer defaults to `not_viewed` for any file without a status
 * entry here.
 */
export type FileViewState = 'viewed' | 'changed_since_viewed';
export type FileViewStatus = {
  path: string;
  state: FileViewState;
  viewed_at: number;
};
/**
 * Return type — the registered repo for the bundled "Get started"
 * project. The TS bindings expose this as `GetStartedProject`. The
 * first workspace is created frontend-side via the normal
 * `createForPrompt` path so it gets a generated name + auto-install.
 */
export type GetStartedProject = { repo: Repo };
/**
 * Surface the user's global Git identity (`user.name` + `user.email`)
 * for the onboarding wizard's Git step. Returns `None` when either
 * value is missing — the UI then nudges the user to run
 * `git config --global user.name "…"` themselves.
 */
export type GitIdentity = { name: string; email: string };
/**
 * Result of a `GET /user` probe with the candidate token.
 */
export type GithubProbeResult =
  | { kind: 'ok'; login: string }
  | { kind: 'unauthorized' }
  | { kind: 'network'; message: string };
/**
 * Outcome of classifying a project's git remotes for PR creation.
 * Drives both the merge-menu gating and the create-PR dialog's precise
 * messaging.
 */
export type GithubRemoteStatus =
  | { kind: 'github_remote'; owner: string; repo: string; remote_name: string }
  | { kind: 'non_github_remote'; url: string; remote_name: string }
  | { kind: 'no_remote' }
  | { kind: 'detect_error'; message: string };
/**
 * Provenance of the currently-stored GitHub token. Exposed to the UI
 * so settings + PR dialog can render "via OAuth" vs "via PAT". Returns
 * `null` if no token is stored or if the keyring lost the sibling kind
 * entry (legacy data from before the provenance slot existed — treated
 * as PAT below).
 */
export type GithubTokenKindDto = 'pat' | 'oauth_clerk';
/**
 * Row in the list returned by `list_clerk_github_repos`. Surfaced to
 * the clone-repo dialog so the user can pick a repo from a search list
 * instead of pasting a URL.
 */
export type ClerkGithubRepo = {
  owner: string;
  name: string;
  full_name: string;
  html_url: string;
  clone_url: string;
  private?: boolean;
  default_branch?: string | null;
  description?: string | null;
  updated_at?: string | null;
};
/**
 * Outcome of an attempt to install package-manager dependencies for a
 * workspace. `ran=false` means no `package.json` was found; the other
 * two flags describe what happened when we did try.
 */
export type InstallResult = {
  /**
   * Detected package manager. "none" when ran=false.
   */
  manager: string;
  /**
   * True if a package.json was present and we attempted install.
   */
  ran: boolean;
  /**
   * True iff the install command exited 0.
   */
  success: boolean;
  /**
   * Stderr tail on failure (empty otherwise). Bounded so we don't
   * dump megabytes of npm output back to the UI.
   */
  message: string;
};
/**
 * Terminal outcome of a `merge_workspace_locally` run.
 */
export type MergeOutcome = {
  /**
   * `"done"` (merge committed, base ref advanced) or `"conflict"`
   * (worktree left mid-merge for the user to resolve in their IDE).
   */
  status: string;
  /**
   * Repo-relative paths reported by `git diff --name-only
   * --diff-filter=U`. Empty when `status == "done"`.
   */
  conflicting_files: string[];
};
export type Message = {
  message_id: string;
  chat_id: string;
  run_id: string | null;
  role: string;
  content: string;
  mode: string | null;
  status: string;
  timeline_json: string | null;
  created_at: number;
};
export type NotificationPreferences = { desktop: boolean; sound: boolean };
export type Appearance = { theme: string; colorMode: string };
export type Notifications = { desktop: boolean; sound: boolean };
export type Timeline = { density: string };
export type Agent = {
  model: string | null;
  mode: string;
  effort: string;
  enabledModelIds: string[];
};
export type Git = { baseBranch: string; mergeAction: string };
export type SettingsDto = {
  version: string;
  appearance: Appearance;
  notifications: Notifications;
  timeline: Timeline;
  agent: Agent;
  git: Git;
};
/**
 * Outcome of a probe call. Sent to the frontend via tauri-specta as a
 * tagged TS union `{ kind: 'connected' | 'invalid' | 'network_error' }`.
 */
export type ProbeResult =
  | { kind: 'connected' }
  | { kind: 'invalid' }
  | { kind: 'network_error' };
/**
 * Where merged config came from for read-time consumers. Mirrors
 * `BootstrapResult.source` minus `"fallback"` (fallback rows are stored
 * in the local DB and read back as `"local"`).
 *
 * `run_json` is the raw JSON text the frontend parses — keeps the
 * `.mozart/run.json` key order intact through the FFI without having
 * to teach `specta::Type` about the ordered-Vec representation.
 */
export type ProjectConfig = {
  runJson: string;
  mergeMode: string;
  /**
   * `"repo"` or `"local"`.
   */
  source: string;
};
export type Repo = {
  repo_id: string;
  path: string;
  display_name: string;
  added_at: number;
  icon: string | null;
  hidden: boolean;
  sort_index: number;
  /**
   * Optional dev/run command (e.g. `pnpm dev`) Phase 4e's Run tab
   * invokes inside a workspace's worktree.
   */
  run_command: string | null;
  /**
   * Optional setup/install command (e.g. `pnpm install`). Runs as
   * the Setup-tab CTA. Both setup_command and run_command can be
   * overridden by a project-level `.mozart/run.json` file at run
   * time (file takes precedence).
   */
  setup_command: string | null;
};
export type StreamEvent =
  | { kind: 'stream_token'; text: string }
  | { kind: 'tool_call'; id: string; name: string; args_json: string }
  | { kind: 'tool_result'; id: string; ok: boolean; summary?: string | null }
  | { kind: 'thinking'; id: string; text: string }
  | { kind: 'cli_output'; line: string }
  | { kind: 'status_update'; status: string }
  | { kind: 'error'; message: string };
export type Task = {
  task_id: string;
  repo_id: string;
  title: string;
  task_text: string;
  status: string;
  created_at: number;
};
/**
 * Wire event payload pushed by the reader thread to the front-end.
 */
export type TerminalEvent =
  /**
   * A chunk of UTF-8 stdout/stderr output.
   */
  | { kind: 'output'; data: string }
  /**
   * The shell process exited (or the reader loop terminated).
   */
  | { kind: 'exited'; code: number };
export type Thread = {
  thread_id: string;
  workspace_id: string;
  created_at: number;
};
export type Workspace = {
  workspace_id: string;
  task_id: string;
  name: string;
  worktree_path: string;
  branch_name: string;
  base_branch: string;
  status: string;
  pinned: boolean;
  unread: boolean;
  created_at: number;
  deletion_intent: number;
  ui_status: string;
  /**
   * Remembered merge action for the AD-02 primary-button label.
   * `'pr'` | `'local'` | `None` (no prior choice → fall back to
   * project_local_config.merge_mode, then remote auto-detect).
   */
  last_merge_action: string | null;
  /**
   * P0.1 atom S0.1.B — agent sandbox isolation tier. Stored as the
   * PascalCase string matching [`crate::claude_cli::sandbox_policy::SandboxLevel`]
   * (`"L1Mozart"` / `"L2Project"` / `"L3Workspace"`); parsed via
   * `SandboxLevel::from_str` at use sites. Migration 010 backfills
   * `'L2Project'` for existing rows; new workspaces inherit the
   * same default. UI toggle is deferred to TODO-008.
   */
  sandbox_level: string;
  /**
   * PR creation result, persisted so "Open in GitHub" + PR status
   * survive dialog close / app restart (and so a re-opened workspace
   * shows `already-has-pr`). `null` until the first PR is opened.
   */
  pr_url: string | null;
  pr_number: number | null;
  pr_state: string | null;
};
export type WorkspaceChange = {
  change_id: number;
  workspace_id: string;
  run_id: string | null;
  diff_text: string;
  files_added: number;
  files_modified: number;
  files_deleted: number;
  captured_at: number;
};
export type WorkspaceDiffStats = {
  workspace_id: string;
  added: number;
  removed: number;
};

/** tauri-specta globals **/

import {
  invoke as TAURI_INVOKE,
  Channel as TAURI_CHANNEL,
} from '@tauri-apps/api/core';
import * as TAURI_API_EVENT from '@tauri-apps/api/event';
import { type WebviewWindow as __WebviewWindow__ } from '@tauri-apps/api/webviewWindow';

type __EventObj__<T> = {
  listen: (
    cb: TAURI_API_EVENT.EventCallback<T>,
  ) => ReturnType<typeof TAURI_API_EVENT.listen<T>>;
  once: (
    cb: TAURI_API_EVENT.EventCallback<T>,
  ) => ReturnType<typeof TAURI_API_EVENT.once<T>>;
  emit: null extends T
    ? (payload?: T) => ReturnType<typeof TAURI_API_EVENT.emit>
    : (payload: T) => ReturnType<typeof TAURI_API_EVENT.emit>;
};

export type Result<T, E> =
  | { status: 'ok'; data: T }
  | { status: 'error'; error: E };

function __makeEvents__<T extends Record<string, any>>(
  mappings: Record<keyof T, string>,
) {
  return new Proxy(
    {} as unknown as {
      [K in keyof T]: __EventObj__<T[K]> & {
        (handle: __WebviewWindow__): __EventObj__<T[K]>;
      };
    },
    {
      get: (_, event) => {
        const name = mappings[event as keyof T];

        return new Proxy((() => {}) as any, {
          apply: (_, __, [window]: [__WebviewWindow__]) => ({
            listen: (arg: any) => window.listen(name, arg),
            once: (arg: any) => window.once(name, arg),
            emit: (arg: any) => window.emit(name, arg),
          }),
          get: (_, command: keyof __EventObj__<any>) => {
            switch (command) {
              case 'listen':
                return (arg: any) => TAURI_API_EVENT.listen(name, arg);
              case 'once':
                return (arg: any) => TAURI_API_EVENT.once(name, arg);
              case 'emit':
                return (arg: any) => TAURI_API_EVENT.emit(name, arg);
            }
          },
        });
      },
    },
  );
}

export type ResolvedCommands = { run: string | null; setup: string | null };
