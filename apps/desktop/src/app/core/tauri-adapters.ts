import { Provider } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';
import { homeDir } from '@tauri-apps/api/path';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { AUTH_ADAPTER } from '../domains/auth';
import { tauriAuthAdapter } from '../domains/auth/data/tauri-auth.adapter';
import {
  CHATS_ADAPTER,
  MESSAGES_ADAPTER,
  chatFromDto,
  messageFromDto,
  turnStateToJson,
  type ChatsAdapter,
  type MessagesAdapter,
} from '../domains/chat';
import { LLM_ADAPTER, TauriClaudeAdapter } from '../domains/llm-model';
import {
  GET_STARTED_PROJECT_ADAPTER,
  GIT_CHECK_ADAPTER,
  ONBOARDING_ADAPTER,
  PROVIDER_SETUP_ADAPTER,
} from '../domains/onboarding';
import { tauriGetStartedProjectAdapter } from '../domains/onboarding/data/tauri-get-started-project.adapter';
import { tauriGitCheckAdapter } from '../domains/onboarding/data/tauri-git-check.adapter';
import { tauriOnboardingAdapter } from '../domains/onboarding/data/tauri-onboarding.adapter';
import { tauriProviderSetupAdapter } from '../domains/onboarding/data/tauri-provider-setup.adapter';
import {
  CREDENTIALS_ADAPTER,
  NOTIFICATION_PREFS_ADAPTER,
  type CredentialsAdapter,
} from '../domains/profile';
import { tauriNotificationPrefsAdapter } from '../domains/profile/data/tauri-notification-prefs.adapter';
import {
  DIALOG_ADAPTER,
  PROJECTS_ADAPTER,
  projectFromDto,
  type ProjectsAdapter,
} from '../domains/projects';
import {
  REPOSITORIES_ADAPTER,
  fileNodeFromDto,
  type RepositoriesAdapter,
} from '../domains/repositories';
import {
  TASKS_ADAPTER,
  taskFromDto,
  type TasksAdapter,
} from '../domains/tasks';
import { RUNS_ADAPTER, type RunsAdapter } from '../domains/runs';
import {
  TERMINALS_ADAPTER,
  type TerminalEvent as TerminalEventModel,
  type TerminalsAdapter,
} from '../domains/terminals';
import {
  WORKSPACES_ADAPTER,
  type OpenInToolId as OpenInToolIdAlias,
  type WorkspacesAdapter,
} from '../domains/workspaces';
import {
  commands,
  type FileTreeEvent,
  type TerminalEvent as TerminalEventDto,
} from './_bindings';

function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

function provideAuthAdapter(): Provider {
  return {
    provide: AUTH_ADAPTER,
    useFactory: () => tauriAuthAdapter(),
  };
}

function provideOnboardingAdapter(): Provider {
  return {
    provide: ONBOARDING_ADAPTER,
    useFactory: () => tauriOnboardingAdapter(),
  };
}

function provideGitCheckAdapter(): Provider {
  return {
    provide: GIT_CHECK_ADAPTER,
    useFactory: () => tauriGitCheckAdapter(),
  };
}

function provideProviderSetupAdapter(): Provider {
  return {
    provide: PROVIDER_SETUP_ADAPTER,
    useFactory: () => tauriProviderSetupAdapter(),
  };
}

function provideGetStartedProjectAdapter(): Provider {
  return {
    provide: GET_STARTED_PROJECT_ADAPTER,
    useFactory: () => tauriGetStartedProjectAdapter(),
  };
}

function provideNotificationPrefsAdapter(): Provider {
  return {
    provide: NOTIFICATION_PREFS_ADAPTER,
    useFactory: () => tauriNotificationPrefsAdapter(),
  };
}

function provideDialogAdapter(): Provider {
  return {
    provide: DIALOG_ADAPTER,
    useFactory: () => ({
      async pickFolder(opts?: { defaultPath?: string }) {
        const result = await openDialog({
          directory: true,
          multiple: false,
          defaultPath: opts?.defaultPath ?? (await homeDir()),
        });
        return typeof result === 'string' ? result : null;
      },
      async homeDir() {
        return await homeDir();
      },
    }),
  };
}

function provideProjectsAdapter(): Provider {
  return {
    provide: PROJECTS_ADAPTER,
    useValue: {
      async add(path) {
        return projectFromDto(unwrap(await commands.addRepo(path)));
      },
      async bootstrap(path) {
        const r = unwrap(await commands.bootstrapProject(path));
        // The backend returns a flat result; we re-fetch the project row
        // to surface the Project model with hydrated display_name etc.
        // listRepos is the cheapest seed since bootstrap is a once-per-
        // open operation.
        const repos = unwrap(await commands.listRepos());
        const dto = repos.find((p) => p.repo_id === r.projectId);
        if (!dto) {
          throw new Error(
            `bootstrap returned project ${r.projectId} but it is not in listRepos`,
          );
        }
        return {
          project: projectFromDto(dto),
          firstWorkspaceId: r.firstWorkspaceId,
          startChatId: r.startChatId,
          source: r.source,
          setupProgressMessageId: r.setupProgressMessageId ?? null,
        };
      },
      async initRepo(path) {
        unwrap(await commands.initRepo(path));
      },
      async cloneRepo(url, destDir) {
        return unwrap(await commands.cloneRepo(url, destDir));
      },
      async createProjectFolder(parent, name) {
        return unwrap(await commands.createProjectFolder(parent, name));
      },
      async list() {
        return unwrap(await commands.listRepos()).map(projectFromDto);
      },
      async remove(id) {
        unwrap(await commands.removeRepo(id));
      },
      async setIcon(id, icon) {
        unwrap(await commands.setRepoIcon(id, icon));
      },
      async setHidden(id, hidden) {
        unwrap(await commands.setRepoHidden(id, hidden));
      },
      async setSort(orderedIds) {
        unwrap(await commands.setRepoSort([...orderedIds]));
      },
      async setRunCommand(id, command) {
        unwrap(await commands.setRepoRunCommand(id, command));
      },
    } satisfies ProjectsAdapter,
  };
}

function provideWorkspacesAdapter(): Provider {
  return {
    provide: WORKSPACES_ADAPTER,
    useValue: {
      async create({ projectId, baseBranch, taskText, workspaceName }) {
        return unwrap(
          await commands.createWorkspace(
            projectId,
            baseBranch,
            taskText,
            workspaceName,
          ),
        );
      },
      async list() {
        return unwrap(await commands.listWorkspaces());
      },
      async archive(workspaceId: string) {
        unwrap(await commands.archiveWorkspace(workspaceId));
      },
      async listBranches(repoPath: string) {
        return unwrap(await commands.listBranches(repoPath));
      },
      async rename(workspaceId: string, name: string) {
        unwrap(await commands.renameWorkspace(workspaceId, name));
      },
      async setUiStatus(workspaceId, status) {
        unwrap(await commands.setWorkspaceUiStatus(workspaceId, status));
      },
      async reopen(workspaceId, targetUiStatus) {
        unwrap(await commands.reopenWorkspace(workspaceId, targetUiStatus));
      },
      async setPinned(workspaceId: string, pinned: boolean) {
        unwrap(await commands.setWorkspacePinned(workspaceId, pinned));
      },
      async setUnread(workspaceId: string, unread: boolean) {
        unwrap(await commands.setWorkspaceUnread(workspaceId, unread));
      },
      async installPackages(workspaceId: string) {
        return unwrap(await commands.installWorkspacePackages(workspaceId));
      },
      async detectInstalledIdes() {
        const detected = unwrap(await commands.detectInstalledIdes());
        return detected.map((d) => d.id as OpenInToolIdAlias);
      },
      async openInIde(workspaceId, ideId) {
        unwrap(await commands.openInIde(workspaceId, ideId));
      },
      async listDiffStats() {
        const list = unwrap(await commands.listWorkspaceDiffStats());
        return list.map((s) => ({
          workspaceId: s.workspace_id,
          added: s.added,
          removed: s.removed,
        }));
      },
    } satisfies WorkspacesAdapter,
  };
}

function provideChatsAdapter(): Provider {
  return {
    provide: CHATS_ADAPTER,
    useValue: {
      async listForWorkspace(workspaceId) {
        return unwrap(await commands.listChats(workspaceId)).map(chatFromDto);
      },
      async listAll() {
        return unwrap(await commands.listAllChats()).map(chatFromDto);
      },
      async create(workspaceId, title) {
        return chatFromDto(
          unwrap(await commands.createChat(workspaceId, title, null)),
        );
      },
      async rename(chatId, title) {
        unwrap(await commands.renameChat(chatId, title));
      },
      async close(chatId) {
        unwrap(await commands.closeChat(chatId));
      },
      async getActive(workspaceId) {
        return unwrap(await commands.getActiveChat(workspaceId));
      },
      async setActive(workspaceId, chatId) {
        unwrap(await commands.setActiveChat(workspaceId, chatId));
      },
      async updateMode(chatId, mode) {
        unwrap(await commands.updateChatMode(chatId, mode));
      },
      async updateEffort(chatId, effort) {
        unwrap(await commands.updateChatEffort(chatId, effort));
      },
      async updateModel(chatId, modelId) {
        unwrap(await commands.updateChatModel(chatId, modelId));
      },
      async markRead(chatId, messageId) {
        unwrap(await commands.markChatRead(chatId, messageId));
      },
    } satisfies ChatsAdapter,
  };
}

function provideMessagesAdapter(): Provider {
  return {
    provide: MESSAGES_ADAPTER,
    useValue: {
      async listForChat(chatId) {
        return unwrap(await commands.listMessages(chatId)).map(messageFromDto);
      },
      async insert(input) {
        return messageFromDto(
          unwrap(
            await commands.insertMessage(
              input.messageId,
              input.chatId,
              input.role,
              input.content,
              input.mode,
              input.status,
              input.runId ?? null,
              turnStateToJson(input.turnState ?? undefined),
            ),
          ),
        );
      },
      async updateContent(messageId, content) {
        unwrap(await commands.updateMessageContent(messageId, content));
      },
      async updateStatus(messageId, status) {
        unwrap(await commands.updateMessageStatus(messageId, status));
      },
      async updateTurnState(messageId, turnState) {
        unwrap(
          await commands.updateMessageTimeline(
            messageId,
            turnStateToJson(turnState ?? undefined),
          ),
        );
      },
      async updateSetupProgress(messageId, progress) {
        unwrap(
          await commands.updateMessageTimeline(
            messageId,
            JSON.stringify(progress),
          ),
        );
      },
    } satisfies MessagesAdapter,
  };
}

function provideTasksAdapter(): Provider {
  return {
    provide: TASKS_ADAPTER,
    useValue: {
      async list(projectId) {
        return unwrap(await commands.listTasks(projectId)).map(taskFromDto);
      },
    } satisfies TasksAdapter,
  };
}

function provideCredentialsAdapter(): Provider {
  return {
    provide: CREDENTIALS_ADAPTER,
    useFactory: (): CredentialsAdapter => ({
      async hasStoredKey() {
        const r = await commands.hasAnthropicKey();
        if (r.status === 'error') throw new Error(r.error.kind);
        return r.data;
      },
      async hasClaudeCodeSession() {
        return await commands.checkClaudeCodeSession();
      },
      async connect(key: string) {
        const r = await commands.connectAnthropic(key);
        if (r.status === 'error') throw new Error(r.error.kind);
        return r.data.kind;
      },
      async clear() {
        const r = await commands.disconnectAnthropic();
        if (r.status === 'error') throw new Error(r.error.kind);
      },
      async refresh() {
        const r = await commands.refreshAnthropicConnection();
        if (r.status === 'error') throw new Error(r.error.kind);
        return r.data.kind;
      },
      async hasGithubToken() {
        const r = await commands.hasGithubToken();
        if (r.status === 'error') throw new Error(r.error.kind);
        return r.data;
      },
      async connectGithub(token: string) {
        const r = await commands.connectGithub(token);
        if (r.status === 'error') throw new Error(r.error.kind);
        const probe = r.data;
        if (probe.kind === 'ok') return { kind: 'ok', login: probe.login };
        if (probe.kind === 'unauthorized') return { kind: 'unauthorized' };
        return { kind: 'network_error', message: probe.message };
      },
      async disconnectGithub() {
        const r = await commands.disconnectGithub();
        if (r.status === 'error') throw new Error(r.error.kind);
      },
    }),
  };
}

function provideLlmAdapter(): Provider {
  return { provide: LLM_ADAPTER, useExisting: TauriClaudeAdapter };
}

function provideRepositoriesAdapter(): Provider {
  return {
    provide: REPOSITORIES_ADAPTER,
    useValue: {
      async listTree(workspaceId, showIgnored) {
        return unwrap(
          await commands.listRepositoryTree(workspaceId, showIgnored),
        ).map(fileNodeFromDto);
      },
      async watchTree(workspaceId, onChange) {
        const channel = new Channel<FileTreeEvent>();
        channel.onmessage = () => onChange();
        unwrap(await commands.watchRepositoryTree(workspaceId, channel));
        return async () => {
          channel.onmessage = () => {
            // no-op after unsubscribe
          };
          unwrap(await commands.unwatchRepositoryTree(workspaceId));
        };
      },
      async getFileDiff(workspaceId, path) {
        return unwrap(await commands.getFileDiff(workspaceId, path));
      },
      async readFile(workspaceId, path) {
        return unwrap(await commands.readWorkspaceFile(workspaceId, path));
      },
      async listChangedFiles(workspaceId) {
        const list = unwrap(await commands.listChangedFiles(workspaceId));
        return list.map((f) => ({
          path: f.path,
          status:
            f.status === 'added' || f.status === 'deleted'
              ? f.status
              : 'modified',
          // `staged` was added to the Rust struct alongside the
          // staged/unstaged split in the Changes pane. Older Tauri
          // builds (or stale bindings) may omit it → default to false.
          staged: f.staged ?? false,
          added: f.added ?? 0,
          removed: f.removed ?? 0,
        }));
      },
      async commitWorkspace(workspaceId, paths, message) {
        return unwrap(
          await commands.commitWorkspace(workspaceId, [...paths], message),
        );
      },
      async stageFile(workspaceId, path) {
        unwrap(await commands.stageFile(workspaceId, path));
      },
      async unstageFile(workspaceId, path) {
        unwrap(await commands.unstageFile(workspaceId, path));
      },
      async isStaged(workspaceId, path) {
        return unwrap(await commands.isStaged(workspaceId, path));
      },
      async discardWorkspaceChanges(workspaceId) {
        unwrap(await commands.discardWorkspaceChanges(workspaceId));
      },
    } satisfies RepositoriesAdapter,
  };
}

function provideTerminalsAdapter(): Provider {
  return {
    provide: TERMINALS_ADAPTER,
    useValue: {
      async open(workspaceId, cols, rows, onEvent) {
        const channel = new Channel<TerminalEventDto>();
        channel.onmessage = (ev) => onEvent(toTerminalEventModel(ev));
        unwrap(
          await commands.openTerminal(workspaceId, cols, rows, channel),
        );
        return async () => {
          channel.onmessage = () => {
            // no-op after unsubscribe
          };
          unwrap(await commands.closeTerminal(workspaceId));
        };
      },
      async write(workspaceId, data) {
        unwrap(await commands.writeTerminal(workspaceId, data));
      },
      async resize(workspaceId, cols, rows) {
        unwrap(await commands.resizeTerminal(workspaceId, cols, rows));
      },
    } satisfies TerminalsAdapter,
  };
}

function provideRunsAdapter(): Provider {
  return {
    provide: RUNS_ADAPTER,
    useValue: {
      async openRun(workspaceId, cols, rows, onEvent) {
        const channel = new Channel<TerminalEventDto>();
        channel.onmessage = (ev) => onEvent(toTerminalEventModel(ev));
        unwrap(
          await commands.startWorkspaceRun(workspaceId, cols, rows, channel),
        );
      },
      async stopRun(workspaceId) {
        unwrap(await commands.stopWorkspaceRun(workspaceId));
      },
    } satisfies RunsAdapter,
  };
}

function toTerminalEventModel(ev: TerminalEventDto): TerminalEventModel {
  if (ev.kind === 'output') {
    return { kind: 'output', data: ev.data };
  }
  return { kind: 'exited', code: ev.code };
}

export function provideTauriAdapters(): Provider[] {
  return [
    provideAuthAdapter(),
    provideOnboardingAdapter(),
    provideGitCheckAdapter(),
    provideProviderSetupAdapter(),
    provideGetStartedProjectAdapter(),
    provideNotificationPrefsAdapter(),
    provideDialogAdapter(),
    provideProjectsAdapter(),
    provideWorkspacesAdapter(),
    provideChatsAdapter(),
    provideMessagesAdapter(),
    provideTasksAdapter(),
    provideCredentialsAdapter(),
    provideLlmAdapter(),
    provideRepositoriesAdapter(),
    provideTerminalsAdapter(),
    provideRunsAdapter(),
  ];
}
