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
import { lucideExternalLink, lucideGithub } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';

export interface CreatePrDialogContext {
  readonly workspaceId: string;
  readonly defaultTitle?: string;
  readonly defaultBody?: string;
  readonly onCreated?: (url: string) => void;
}

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
  providers: [provideIcons({ lucideExternalLink, lucideGithub })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle class="flex items-center gap-2">
        <ng-icon hlm name="lucideGithub" size="sm" />
        Create pull request
      </h3>
    </div>
    @if (createdUrl(); as url) {
      <div class="px-6 py-4 space-y-2">
        <p class="text-sm text-muted-foreground">
          Pull request opened.
        </p>
        <a
          [href]="url"
          target="_blank"
          rel="noopener"
          class="inline-flex items-center gap-1 text-sm text-primary underline"
        >
          <ng-icon hlm name="lucideExternalLink" size="xs" />
          {{ url }}
        </a>
      </div>
      <div hlmDialogFooter class="px-6 py-4">
        <button hlmDialogClose hlmBtn variant="default" type="button">
          Close
        </button>
      </div>
    } @else {
      <div class="px-6 py-4 space-y-4">
        @if (!profile.githubConnected()) {
          <div hlmAlert variant="default">
            <p hlmAlertDescription>
              Connect your GitHub account to open this PR.
            </p>
          </div>
        }
        <div>
          <label
            for="pr-title"
            class="mb-1 block text-xs font-medium text-muted-foreground"
            >Title</label
          >
          <input
            id="pr-title"
            type="text"
            hlmInput
            class="w-full text-sm"
            [value]="title()"
            (input)="onTitleInput($event)"
          />
        </div>
        <div>
          <label
            for="pr-body"
            class="mb-1 block text-xs font-medium text-muted-foreground"
            >Description</label
          >
          <textarea
            id="pr-body"
            hlmInput
            rows="6"
            class="w-full resize-y text-sm"
            placeholder="What does this PR change?"
            [value]="body()"
            (input)="onBodyInput($event)"
          ></textarea>
        </div>
        <label class="flex cursor-pointer items-center gap-2 pt-1 text-sm">
          <input
            type="checkbox"
            class="h-3 w-3 cursor-pointer"
            [checked]="draft()"
            (change)="toggleDraft()"
          />
          Open as draft
        </label>
        @if (error(); as err) {
          <p class="text-xs text-destructive">{{ err }}</p>
        }
        <p class="text-xs text-muted-foreground">
          Mozart pushes the workspace branch to <code class="font-mono">origin</code>
          and opens the PR against the workspace's base branch.
        </p>
      </div>
      <div hlmDialogFooter class="px-6 py-4">
        <button hlmDialogClose hlmBtn variant="outline" type="button">
          Cancel
        </button>
        <button
          hlmBtn
          type="button"
          [disabled]="!canSubmit()"
          (click)="onSubmit()"
        >
          @if (submitting()) {
            Pushing &amp; creating…
          } @else {
            Create pull request
          }
        </button>
      </div>
    }
  `,
})
export class FeatureCreatePrDialog {
  protected readonly ctx = injectBrnDialogContext<CreatePrDialogContext>();
  private readonly ref = inject(BrnDialogRef);
  protected readonly profile = inject(ProfileFacade);
  private readonly workspaces = inject(WorkspacesFacade);

  protected readonly title = signal(this.ctx.defaultTitle ?? '');
  protected readonly body = signal(this.ctx.defaultBody ?? '');
  protected readonly draft = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly createdUrl = signal<string | null>(null);

  // Submit gates on three signals: non-empty title, not mid-flight,
  // AND GitHub is connected. Mid-flow disconnect (token revoked in
  // another window) reactively flips this to `false`.
  protected readonly canSubmit = computed(
    () =>
      !this.submitting() &&
      this.title().trim().length > 0 &&
      this.profile.githubConnected(),
  );

  protected onTitleInput(event: Event): void {
    this.title.set((event.target as HTMLInputElement).value);
  }
  protected onBodyInput(event: Event): void {
    this.body.set((event.target as HTMLTextAreaElement).value);
  }
  protected toggleDraft(): void {
    this.draft.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await this.workspaces.createPr(
        this.ctx.workspaceId,
        this.title().trim(),
        this.body(),
        this.draft(),
      );
      this.createdUrl.set(result.pr.htmlUrl);
      this.ctx.onCreated?.(result.pr.htmlUrl);
      // P1.1 D2 — PR succeeded but the status flip to in_review didn't.
      // Surface to the user; keep the URL visible so they don't lose
      // the artifact, and skip rollback so they can refresh to recover.
      if (result.statusFlipFailed) {
        toast.error(
          'PR opened, but status update failed — refresh to retry.',
        );
      }
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.submitting.set(false);
    }
  }
}
