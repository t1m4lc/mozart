/**
 * `CreateWorkspaceDialogComponent` — "New workspace" dialog. Inputs:
 *
 *   - Project (locked): resolved from one of two sources, in order —
 *       1. The injected `CREATE_WORKSPACE_DIALOG_CTX` token (production
 *          path: `HlmDialogService.open(... , { context: { lockedRepoId } })`).
 *          The brain dialog service surfaces this via
 *          `injectBrnDialogContext`, but we also expose an Angular DI
 *          token so unit tests can drive the context without spinning
 *          up the brain dialog runtime.
 *       2. `ProjectStore.selectedProject()` — the currently selected
 *          project (e.g. when invoked via global ⌘N).
 *     If neither resolves, the dialog renders an inline "Select a
 *     project first" message and the Create button is disabled.
 *
 *   - Base branch (Select): populated by
 *     `BindingsService.listBranches(repoPath)` on init. A "Loading
 *     branches…" placeholder is shown while the request is pending; if
 *     the request returns an empty list we show an inline "No branches
 *     found in this repository" error.
 *
 *   - Task description (Textarea, 4 rows, 14 px). At least 3
 *     non-whitespace characters required to enable Create.
 *
 * Submit:
 *   - Calls `WorkspaceStore.createWorkspace(repoId, branch, text)`. On
 *     success the store auto-selects the new workspace (so the
 *     ChatPanel surfaces), and we close the dialog with the new
 *     `WorkspaceDto`.
 *   - On `MozartError`, the dialog stays open and the message is
 *     rendered inline.
 *
 * The footer order is fixed `Cancel | Create` on every OS (Q5 lock).
 */
import {
  ChangeDetectionStrategy,
  Component,
  InjectionToken,
  computed,
  effect,
  inject,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { HlmButtonImports } from '@mozart/ui/button';
import {
  HlmDialogDescription,
  HlmDialogFooter,
  HlmDialogHeader,
  HlmDialogTitle,
} from '@mozart/ui/dialog';
import { HlmLabelImports } from '@mozart/ui/label';
import { HlmTextareaImports } from '@mozart/ui/textarea';
import { HlmTooltipImports } from '@mozart/ui/tooltip';

import { BindingsService } from '../services/bindings.service';
import { MozartError } from '../services/mozart-error';
import type {
  RepoDto,
  WorkspaceDto,
} from '../shared/schemas/bindings.schemas';
import { ProjectStore } from '../state/project.store';
import { WorkspaceStore } from '../state/workspace.store';

/**
 * Context shape consumed by `CreateWorkspaceDialogComponent`. When the
 * dialog is opened from a project's `+` button, the caller passes
 * `{ lockedRepoId: project.repo_id }` so the dialog locks to that
 * project regardless of `ProjectStore.selectedProject()`. When invoked
 * via global ⌘N the caller may pass `null` (or the token resolves to
 * `null` in tests) and we fall back to `selectedProject()`.
 */
export interface CreateWorkspaceDialogCtx {
  readonly lockedRepoId: string | null;
}

/**
 * DI token surfacing the dialog context. The `HlmDialogService.open`
 * path threads the context through `injectBrnDialogContext`, so the
 * component reads from both:
 *   - first the `injectBrnDialogContext` result (production)
 *   - then this token (test-friendly fallback)
 */
export const CREATE_WORKSPACE_DIALOG_CTX =
  new InjectionToken<CreateWorkspaceDialogCtx | null>(
    'CREATE_WORKSPACE_DIALOG_CTX',
    { providedIn: 'root', factory: () => null },
  );

type BranchesState =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'loaded'; readonly branches: readonly string[] }
  | { readonly status: 'error'; readonly message: string };

@Component({
  selector: 'app-create-workspace-dialog',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [
    FormsModule,
    HlmDialogHeader,
    HlmDialogTitle,
    HlmDialogDescription,
    HlmDialogFooter,
    HlmButtonImports,
    HlmLabelImports,
    HlmTextareaImports,
    HlmTooltipImports,
  ],
  host: {
    class:
      'block w-[480px] max-w-[90vw] p-6 rounded-md border border-border text-foreground',
  },
  template: `
    <div class="flex flex-col gap-4">
      <hlm-dialog-header>
        <h2 hlmDialogTitle>New workspace</h2>
        <p hlmDialogDescription>
          Pick a base branch and describe what you want the agent to do.
        </p>
      </hlm-dialog-header>

      <form
        class="flex flex-col gap-3.5"
        (submit)="onSubmit($event)"
        novalidate
      >
        <div class="flex flex-col gap-1.5">
          <label hlmLabel for="cw-project">Project</label>
          @if (lockedProject() !== null) {
            <input
              id="cw-project"
              type="text"
              class="w-full px-2.5 py-1.5 bg-muted/40 border border-border rounded-md text-muted-foreground text-[13px] cursor-not-allowed"
              [value]="lockedProject()?.display_name ?? ''"
              disabled
              readonly
            />
          } @else {
            <p class="error-msg m-0 text-[13px]" role="alert">
              Select a project first.
            </p>
          }
        </div>

        <div class="flex flex-col gap-1.5">
          <label hlmLabel for="cw-branch">Base branch</label>
          @switch (branches().status) {
            @case ('idle') {
              <select
                id="cw-branch"
                name="branch"
                class="select w-full px-2.5 py-1.5 border border-border rounded-md text-foreground text-[13px] outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                disabled
              >
                <option value="">No project selected</option>
              </select>
            }
            @case ('loading') {
              <select
                id="cw-branch"
                name="branch"
                class="select w-full px-2.5 py-1.5 border border-border rounded-md text-foreground text-[13px] outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                disabled
              >
                <option value="">Loading branches…</option>
              </select>
            }
            @case ('loaded') {
              <select
                id="cw-branch"
                name="branch"
                class="select w-full px-2.5 py-1.5 border border-border rounded-md text-foreground text-[13px] outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                [value]="baseBranch()"
                (change)="onBranchChange($event)"
              >
                <option value="" disabled>Select branch…</option>
                @for (b of branchList(); track b) {
                  <option [value]="b">{{ b }}</option>
                }
              </select>
              @if (branchList().length === 0) {
                <p class="error-msg m-0 text-xs" role="alert">
                  No branches found in this repository.
                </p>
              }
            }
            @case ('error') {
              <select
                id="cw-branch"
                name="branch"
                class="select w-full px-2.5 py-1.5 border border-border rounded-md text-foreground text-[13px] outline-none disabled:opacity-60 disabled:cursor-not-allowed"
                disabled
              >
                <option value="">Failed to load branches</option>
              </select>
              <p class="error-msg m-0 text-xs" role="alert">{{ branchesErrorMsg() }}</p>
            }
          }
        </div>

        <div class="flex flex-col gap-1.5">
          <label hlmLabel for="cw-task">Task description</label>
          <textarea
            hlmTextarea
            id="cw-task"
            name="task"
            class="resize-y min-h-[96px]"
            rows="4"
            placeholder="Describe what the agent should do."
            [value]="taskText()"
            (input)="onTaskInput($event)"
          ></textarea>
        </div>

        @if (errorMsg() !== null) {
          <p class="error-msg m-0 text-xs" role="alert">{{ errorMsg() }}</p>
        }
      </form>

      <hlm-dialog-footer class="pt-2 border-t border-border">
        <button
          hlmBtn
          variant="ghost"
          type="button"
          (click)="cancel()"
          [disabled]="isSubmitting()"
        >
          Cancel
        </button>
        <button
          hlmBtn
          variant="default"
          type="button"
          class="submit-btn"
          (click)="submit()"
          [disabled]="!canSubmit()"
        >
          @if (isSubmitting()) {
            Creating…
          } @else {
            Create
          }
        </button>
      </hlm-dialog-footer>
    </div>
  `,
  styles: `
    :host {
      background: var(--bg-card, hsl(var(--card)));
      font-family: var(--font-sans);
    }
    .select { background: var(--bg-card, hsl(var(--background))); }
    .select:focus-visible {
      border-color: var(--border-focus, hsl(var(--ring)));
    }
    .error-msg { color: var(--status-error, hsl(var(--destructive))); }
  `,
})
export class CreateWorkspaceDialogComponent {
  private readonly dialogRef =
    inject<BrnDialogRef<WorkspaceDto | undefined>>(BrnDialogRef);
  private readonly bindings = inject(BindingsService);
  private readonly projectStore = inject(ProjectStore);
  private readonly workspaceStore = inject(WorkspaceStore);

  // Production: HlmDialogService.open(... , { context: { lockedRepoId } })
  // surfaces here. Tests: typically null because TestBed doesn't run
  // through the brain dialog service.
  private readonly brnCtx = injectBrnDialogContext<CreateWorkspaceDialogCtx>({
    optional: true,
  });
  // Test-only fallback. Production providers leave this as `null`.
  private readonly tokenCtx = inject(CREATE_WORKSPACE_DIALOG_CTX, {
    optional: true,
  });
  // The brain-dialog context may surface as the raw context object OR
  // (when opened via HlmDialogService) as a wrapper that also carries
  // `$component`, `$showCloseButton`, `$dynamicComponentClass`. We only
  // care about the typed `lockedRepoId` field, which lives at the top
  // level of the context object in both cases.
  private readonly resolvedCtx: CreateWorkspaceDialogCtx | null = (() => {
    const candidate = this.brnCtx ?? this.tokenCtx ?? null;
    if (
      candidate !== null &&
      typeof candidate === 'object' &&
      'lockedRepoId' in candidate
    ) {
      return candidate as CreateWorkspaceDialogCtx;
    }
    return null;
  })();

  // The "locked" project — resolved from context (if provided) or from
  // the current selection. Null when no project is resolvable.
  protected readonly lockedProject = computed<RepoDto | null>(() => {
    const ctxId = this.resolvedCtx?.lockedRepoId ?? null;
    if (ctxId !== null) {
      const list = this.projectStore.projects();
      const found = list.find((p) => p.repo_id === ctxId);
      if (found) return found;
    }
    return this.projectStore.selectedProject();
  });

  protected readonly branches = signal<BranchesState>({ status: 'idle' });
  protected readonly branchList = computed<readonly string[]>(() => {
    const b = this.branches();
    return b.status === 'loaded' ? b.branches : [];
  });
  protected readonly branchesErrorMsg = computed<string>(() => {
    const b = this.branches();
    return b.status === 'error' ? b.message : '';
  });

  // Public for the spec. Templates bind via `[value]` + `(change/input)`.
  readonly baseBranch = signal<string>('');
  readonly taskText = signal<string>('');
  protected readonly errorMsg = signal<string | null>(null);
  protected readonly isSubmitting = signal(false);

  protected readonly canSubmit = computed<boolean>(() => {
    if (this.isSubmitting()) return false;
    if (this.lockedProject() === null) return false;
    if (this.baseBranch().length === 0) return false;
    if (this.taskText().trim().length < 3) return false;
    if (this.branches().status !== 'loaded') return false;
    if (this.branchList().length === 0) return false;
    return true;
  });

  constructor() {
    // Kick off `listBranches` whenever the locked project resolves to
    // a non-null value. The effect is guarded by `untracked()` on the
    // mutators so we don't create a feedback loop.
    effect(() => {
      const project = this.lockedProject();
      if (project === null) return;
      untracked(() => {
        this.branches.set({ status: 'loading' });
      });
      this.bindings
        .listBranches(project.path)
        .then((branches) => {
          this.branches.set({ status: 'loaded', branches });
        })
        .catch((err: unknown) => {
          const message =
            err instanceof MozartError
              ? err.message
              : err instanceof Error
                ? err.message
                : 'Failed to load branches.';
          this.branches.set({ status: 'error', message });
        });
    });
  }

  protected onBranchChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.baseBranch.set(target.value);
  }

  protected onTaskInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.taskText.set(target.value);
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    void this.submit();
  }

  cancel(): void {
    this.dialogRef.close();
  }

  async submit(): Promise<void> {
    if (!this.canSubmit()) return;
    const project = this.lockedProject();
    if (project === null) return;
    this.isSubmitting.set(true);
    this.errorMsg.set(null);
    try {
      const ws = await this.workspaceStore.createWorkspace(
        project.repo_id,
        this.baseBranch(),
        this.taskText().trim(),
      );
      this.dialogRef.close(ws);
    } catch (err) {
      const message =
        err instanceof MozartError
          ? err.message
          : err instanceof Error
            ? err.message
            : 'Failed to create workspace.';
      this.errorMsg.set(message);
      this.isSubmitting.set(false);
    }
  }
}
