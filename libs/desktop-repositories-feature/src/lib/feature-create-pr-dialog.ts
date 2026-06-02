import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmAlertImports } from '@spartan-ui/alert';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInputImports } from '@spartan-ui/input';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideGithub } from '@ng-icons/lucide';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';

export interface CreatePrDialogContext {
  readonly workspaceId: string;
  /** PR title (the caller passes the workspace name). */
  readonly defaultTitle?: string;
  readonly defaultBody?: string;
  /** Branch name used to seed the default commit message. */
  readonly branch?: string;
  /** Uncommitted paths the caller already probed — committed wholesale
   *  before the PR opens. The dialog is only shown when this is
   *  non-empty; the click router (shell-right) handles the clean-tree
   *  fast path and every other gate. */
  readonly changedPaths: readonly string[];
  readonly onCreated?: (pr: {
    readonly url: string;
    readonly number: number;
    readonly statusFlipFailed: boolean;
  }) => void;
}

// Uncommitted-changes gate for Create PR. The click router only opens
// this when the working tree is dirty; every other case (not connected
// / non-GitHub remote / clean tree / PR already open) is handled before
// we get here. So this dialog has one job: commit the changes, then
// open the PR. Success is announced by the caller via `onCreated` (the
// dialog closes itself) so the toast UX is uniform with the fast path.
@Component({
  selector: 'app-feature-create-pr-dialog',
  imports: [
    NgIcon,
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmIconImports,
    HlmInputImports,
  ],
  providers: [provideIcons({ lucideGithub })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle class="flex items-center gap-2">
        <ng-icon hlm name="lucideGithub" size="sm" />
        Create pull request
      </h3>
    </div>

    <div class="px-6 pt-3 space-y-2">
      <div hlmAlert variant="default">
        <p hlmAlertDescription>
          This workspace has uncommitted changes. Mozart will commit them all
          and include them in the pull request.
        </p>
      </div>
      <label
        for="pr-commit-message"
        class="block text-xs font-medium text-muted-foreground"
      >
        Commit message
      </label>
      <input
        id="pr-commit-message"
        hlmInput
        type="text"
        class="w-full text-sm"
        [value]="commitMessage()"
        [disabled]="phase() !== 'idle'"
        (input)="onCommitMessageInput($event)"
      />
    </div>

    <div class="px-6 py-4 space-y-2">
      <p class="text-xs text-muted-foreground">
        Mozart pushes the workspace branch to its GitHub remote and opens the
        pull request for <span class="font-medium">{{ resolvedTitle() }}</span
        >.
      </p>
      @if (error(); as err) {
        <p class="text-xs text-destructive">{{ err }}</p>
      }
    </div>

    <div hlmDialogFooter class="px-6 py-4">
      <button hlmDialogClose hlmBtn variant="ghost" type="button">
        Review changes first
      </button>
      <button hlmBtn type="button" [disabled]="!canSubmit()" (click)="onSubmit()">
        @switch (phase()) {
          @case ('committing') {
            Committing…
          }
          @case ('creating') {
            Pushing &amp; opening PR…
          }
          @default {
            Commit all &amp; create PR
          }
        }
      </button>
    </div>
  `,
})
export class FeatureCreatePrDialog {
  protected readonly ctx = injectBrnDialogContext<CreatePrDialogContext>();
  private readonly ref = inject(BrnDialogRef);
  private readonly workspaces = inject(WorkspacesFacade);

  protected readonly phase = signal<'idle' | 'committing' | 'creating'>('idle');
  protected readonly error = signal<string | null>(null);

  protected readonly resolvedTitle = computed(
    () => (this.ctx.defaultTitle ?? '').trim() || 'Mozart pull request',
  );

  protected readonly commitMessage = signal(
    this.ctx.branch
      ? `Default commit message from ${this.ctx.branch}`
      : (this.ctx.defaultTitle ?? '').trim() || 'Mozart pull request',
  );

  protected readonly canSubmit = computed(
    () => this.phase() === 'idle' && this.commitMessage().trim().length > 0,
  );

  protected onCommitMessageInput(event: Event): void {
    this.commitMessage.set((event.target as HTMLInputElement).value);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.error.set(null);
    try {
      this.phase.set('committing');
      await this.workspaces.commitWorkspace(
        this.ctx.workspaceId,
        this.ctx.changedPaths,
        this.commitMessage().trim(),
      );
      this.phase.set('creating');
      const { pr, statusFlipFailed } = await this.workspaces.createPr(
        this.ctx.workspaceId,
        this.resolvedTitle(),
        this.ctx.defaultBody ?? '',
        false,
      );
      this.ctx.onCreated?.({
        url: pr.htmlUrl,
        number: pr.number,
        statusFlipFailed,
      });
      this.ref.close();
    } catch (err) {
      this.error.set(readErrorText(err));
      this.phase.set('idle');
    }
  }
}

// `workspaces.createPr` / `commitWorkspace` route through the
// bespoke-unwrap adapter that throws the raw `AppError` ({ kind,
// message }) rather than wrapping it in `new Error(...)`. Read
// `.message` from any thrown object that has a string-typed one so the
// dialog never renders "[object Object]".
function readErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return String(err);
}
