/**
 * `FolderPickerService` — wrapper around `@tauri-apps/plugin-dialog`'s
 * `open()` for selecting a project folder via the OS-native picker.
 *
 * Post-1.8b refactor: replaced the text-only `AddRepoDialog` with a
 * native folder picker triggered from the "Open project" dropdown
 * menu item. On selection, the path is forwarded to
 * `ProjectStore.addRepo` (the Rust side validates it's a git repo and
 * surfaces a `MozartError` if not). On cancellation the call resolves
 * to `null` and the store stays untouched.
 *
 * Mocking constraint: the project's unit-test runner forbids
 * `vi.mock` of relative imports. To let specs swap the dialog
 * function out without that, we accept it via an Angular DI token —
 * mirroring the `TAURI_COMMANDS` / `EVENTS_API` pattern in
 * `BindingsService`. Production resolves the token via a
 * `default-factory` pointing at the real `openDialog` import.
 *
 * Errors:
 *   - JS-level rejections from `openDialog` (e.g. plugin permission
 *     missing, runtime panic) bubble up unchanged — callers may catch
 *     them or let them propagate to the global error path.
 *   - `MozartError` from `ProjectStore.addRepo` (e.g. picked folder
 *     is not a git repo) bubble up unchanged so the UI can decide how
 *     to surface the message. The current call sites in the
 *     post-refactor dropdown menu log to console; a toast/sonner
 *     wiring is a follow-up tracked in `docs/TODO.md`.
 */
import { Injectable, InjectionToken, inject } from '@angular/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';

import type { RepoDto } from '../shared/schemas/bindings.schemas';
import { ProjectStore } from '../state/project.store';

/**
 * Minimal shape of `@tauri-apps/plugin-dialog`'s `open` function as we
 * use it (directory-only, single-select). The real signature is more
 * permissive — narrowing here keeps the DI surface honest and means
 * fakes don't have to model the union of every option set.
 *
 * Return values:
 *   - `string` — the selected absolute path.
 *   - `null` — the user cancelled the picker.
 *   - `string[]` — defensive: the real API can return an array when
 *     `multiple: true`. We always pass `multiple: false`, but we still
 *     narrow at runtime in `openAndAddRepo` for type safety.
 */
export type TauriDialogOpen = (options: {
  readonly directory: boolean;
  readonly multiple: boolean;
}) => Promise<string | string[] | null>;

/**
 * DI token for the plugin-dialog `open` function. Production resolves
 * to the real `openDialog` import; specs provide a `vi.fn()` fake.
 */
export const TAURI_DIALOG_OPEN = new InjectionToken<TauriDialogOpen>(
  'TAURI_DIALOG_OPEN',
  {
    providedIn: 'root',
    factory: () => openDialog as TauriDialogOpen,
  },
);

@Injectable({ providedIn: 'root' })
export class FolderPickerService {
  private readonly projects = inject(ProjectStore);
  private readonly openDialog = inject(TAURI_DIALOG_OPEN);

  /**
   * Open the OS-native folder picker. On selection, calls
   * `ProjectStore.addRepo(path)`. Returns the new `RepoDto` on
   * success, `null` on cancellation, or rejects with the underlying
   * error (typically `MozartError` from the store) on failure.
   */
  async openAndAddRepo(): Promise<RepoDto | null> {
    const path = await this.openDialog({
      directory: true,
      multiple: false,
    });
    if (path === null || path === '') return null;
    // `multiple: false` means the real API returns a string, but the
    // declared return type is the union `string | string[]`. Narrow
    // defensively so the call site can always assume a single path.
    const selected = typeof path === 'string' ? path : path[0];
    if (!selected) return null;
    return await this.projects.addRepo(selected);
  }
}
