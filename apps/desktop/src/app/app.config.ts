import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import {
  provideRouter,
  withComponentInputBinding,
  withHashLocation,
} from '@angular/router';
import { provideTheme } from '@mozart/shared-util-theme';
import { homeDir } from '@tauri-apps/api/path';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { appRoutes } from './app.routes';
import { commands } from './core/_bindings';
import {
  CREDENTIALS_ADAPTER,
  type CredentialsAdapter,
  ProfileFacade,
} from './domains/profile';
import {
  DIALOG_ADAPTER,
  PROJECTS_ADAPTER,
  ProjectsFacade,
  projectFromDto,
  type ProjectsAdapter,
} from './domains/projects';
import { TASKS_ADAPTER, taskFromDto, type TasksAdapter } from './domains/tasks';
import {
  WORKSPACES_ADAPTER,
  WorkspacesFacade,
  type WorkspacesAdapter,
} from './domains/workspaces';

// Small helper: unwrap the tauri-specta Result envelope into a value or
// thrown error so the rest of the app can write straight `await`s.
function unwrap<T>(
  r:
    | { status: 'ok'; data: T }
    | { status: 'error'; error: { message: string } },
): T {
  if (r.status === 'error') throw new Error(r.error.message);
  return r.data;
}

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(appRoutes, withHashLocation(), withComponentInputBinding()),
    provideTheme(),
    {
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
      }),
    },
    {
      provide: PROJECTS_ADAPTER,
      useValue: {
        async add(path) {
          return projectFromDto(unwrap(await commands.addRepo(path)));
        },
        async list() {
          const dtos = unwrap(await commands.listRepos());
          return dtos.map(projectFromDto);
        },
        async remove(_id) {
          // No `remove_repo` Tauri command in v0.0.1. Soft-hide via
          // ProjectStore.hideProject is the supported UX; physical
          // removal lands when the backend exposes the command.
          throw new Error('remove_repo not implemented in v0.0.1');
        },
      } satisfies ProjectsAdapter,
    },
    {
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
        async setPinned(workspaceId: string, pinned: boolean) {
          unwrap(await commands.setWorkspacePinned(workspaceId, pinned));
        },
        async setUnread(workspaceId: string, unread: boolean) {
          unwrap(await commands.setWorkspaceUnread(workspaceId, unread));
        },
      } satisfies WorkspacesAdapter,
    },
    {
      provide: TASKS_ADAPTER,
      useValue: {
        async list(projectId) {
          const dtos = unwrap(await commands.listTasks(projectId));
          return dtos.map(taskFromDto);
        },
      } satisfies TasksAdapter,
    },
    // Tauri-backed credentials adapter for the Anthropic key. This is the
    // ONLY file in the app that touches `core/_bindings` for credentials —
    // the profile domain stays Tauri-agnostic per Convention #2.
    {
      provide: CREDENTIALS_ADAPTER,
      useFactory: (): CredentialsAdapter => ({
        async hasStoredKey() {
          const r = await commands.hasAnthropicKey();
          if (r.status === 'error') throw new Error(r.error.kind);
          return r.data;
        },
        async hasClaudeCodeSession() {
          // Returns plain boolean (not Result-wrapped) — see commands/mod.rs.
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
    },

    // Hydrate from Tauri at boot. Order matters: projects first
    // (workspaces.loadAll depends on the project list to enumerate
    // tasks per project). Errors are swallowed (logged) so a hydration
    // failure never blocks the app from rendering.
    provideAppInitializer(async () => {
      const projects = inject(ProjectsFacade);
      const workspaces = inject(WorkspacesFacade);
      try {
        await projects.loadAll();
        await workspaces.loadAll();
      } catch (err) {
        console.error('hydration failed on boot', err);
      }
    }),

    // Fire-and-forget probe at app start so /settings is up-to-date even
    // when the user doesn't open the settings page first. The facade's
    // own `status === 'unknown'` guard makes this idempotent with the
    // lazy call in feature-connections.constructor.
    provideAppInitializer(() => {
      void inject(ProfileFacade).initialize();
    }),
  ],
};
