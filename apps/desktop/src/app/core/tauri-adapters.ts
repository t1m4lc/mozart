import { Provider } from '@angular/core';
import { Channel } from '@tauri-apps/api/core';
import { homeDir } from '@tauri-apps/api/path';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
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
  CREDENTIALS_ADAPTER,
  type CredentialsAdapter,
} from '../domains/profile';
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
      async listChangedFiles(workspaceId) {
        const list = unwrap(await commands.listChangedFiles(workspaceId));
        return list.map((f) => ({
          path: f.path,
          status:
            f.status === 'added' || f.status === 'deleted'
              ? f.status
              : 'modified',
        }));
      },
      async commitWorkspace(workspaceId, paths, message) {
        return unwrap(
          await commands.commitWorkspace(workspaceId, [...paths], message),
        );
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
