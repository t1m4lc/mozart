import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmInputImports } from '@mozart/ui/input';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideExternalLink, lucideGithub } from '@ng-icons/lucide';
import { commands } from '../../core/_bindings';

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

  protected readonly title = signal(this.ctx.defaultTitle ?? '');
  protected readonly body = signal(this.ctx.defaultBody ?? '');
  protected readonly draft = signal(false);
  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly createdUrl = signal<string | null>(null);

  protected readonly canSubmit = computed(
    () => !this.submitting() && this.title().trim().length > 0,
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
      const r = await commands.createWorkspacePr(
        this.ctx.workspaceId,
        this.title().trim(),
        this.body(),
        this.draft(),
      );
      if (r.status === 'error') {
        this.error.set(r.error.message);
        this.submitting.set(false);
        return;
      }
      this.createdUrl.set(r.data.html_url);
      this.ctx.onCreated?.(r.data.html_url);
    } catch (err) {
      this.error.set(err instanceof Error ? err.message : String(err));
    } finally {
      this.submitting.set(false);
    }
  }
}
