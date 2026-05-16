import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmAlertImports } from '@mozart/ui/alert';
import { HlmButtonImports } from '@mozart/ui/button';
import { HlmDialogImports } from '@mozart/ui/dialog';
import { HlmIconImports } from '@mozart/ui/icon';
import { HlmInputImports } from '@mozart/ui/input';
import { HlmLabelImports } from '@mozart/ui/label';
import { HlmSpinnerImports } from '@mozart/ui/spinner';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideFolderOpen } from '@ng-icons/lucide';
import { DIALOG_ADAPTER } from './data/dialog.adapter';

export interface CloneRepoContext {
  // Pre-resolved default location (e.g. `<home>/mozart/repos`). The
  // dialog seeds the Location field with this. The flow that opens the
  // dialog precomputes it so the dialog stays synchronous on first paint.
  defaultLocation: string;
  // Called with the cloned folder path once `git clone` succeeds. The
  // flow then runs the unified add-project path. Returns a Promise so
  // the dialog can surface failures inline.
  onCloned: (path: string) => Promise<void>;
  // Called by the dialog to perform the clone itself. Kept on the
  // context (rather than re-injecting facade here) so the dialog stays
  // a dumb form view — testable without Tauri / router / facade graph.
  doClone: (url: string, destDir: string) => Promise<string>;
}

// "Clone GitHub repo" dialog. URL + location + Browse. Enter submits.
// On clone success, the flow takes over (registers the project,
// auto-creates the first workspace + chat, navigates).
//
// Plain signal-based form state — matches the existing dialog pattern
// in the project (UiConnectDialog). Signal Forms migration deferred.

// Match `https://github.com/owner/repo` with an optional `.git` suffix.
// Trailing slash tolerated. Owner / repo allow word chars, dots, and
// hyphens — matching GitHub's own naming rules.
const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/;
@Component({
  selector: 'app-clone-repo-dialog',
  imports: [
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmIconImports,
    HlmInputImports,
    HlmLabelImports,
    HlmSpinnerImports,
    NgIcon,
  ],
  providers: [provideIcons({ lucideFolderOpen })],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader>
      <h3 hlmDialogTitle>Clone GitHub repo</h3>
      <p hlmDialogDescription>
        Paste a repository URL and pick a location. Mozart will clone it
        and open the result as a project.
      </p>
    </div>

    <form
      class="space-y-3 px-6"
      (submit)="onFormSubmit($event)"
      autocomplete="off"
    >
      <div class="space-y-1.5">
        <label hlmLabel for="clone-url">Repository URL</label>
        <input
          hlmInput
          type="text"
          id="clone-url"
          name="url"
          placeholder="https://github.com/owner/repo.git"
          autocomplete="off"
          spellcheck="false"
          autocapitalize="off"
          [value]="url()"
          (input)="onUrlInput($event)"
          [disabled]="cloning()"
          [attr.aria-invalid]="urlError() ? true : null"
          aria-describedby="clone-url-error"
          autofocus
        />
        @if (urlError()) {
          <p id="clone-url-error" class="text-xs text-destructive">
            {{ urlError() }}
          </p>
        }
      </div>

      <div class="space-y-1.5">
        <label hlmLabel for="clone-location">Location</label>
        <div class="flex gap-2">
          <input
            hlmInput
            type="text"
            id="clone-location"
            name="location"
            autocomplete="off"
            spellcheck="false"
            autocapitalize="off"
            class="flex-1"
            [value]="location()"
            (input)="onLocationInput($event)"
            [disabled]="cloning()"
          />
          <button
            hlmBtn
            variant="outline"
            type="button"
            (click)="browse()"
            [disabled]="cloning()"
          >
            <ng-icon hlm name="lucideFolderOpen" size="sm" />
            Browse
          </button>
        </div>
        @if (clonePreview()) {
          <p class="text-xs text-muted-foreground">
            Will clone to <span class="font-mono">{{ clonePreview() }}</span>
          </p>
        }
      </div>

      @if (error()) {
        <div hlmAlert variant="destructive">
          <p hlmAlertDescription>{{ error() }}</p>
        </div>
      }

      <!-- Hidden submit keeps Enter -> submit working when focus is
           in either text input. Visible action lives in the footer. -->
      <button type="submit" class="hidden" aria-hidden="true"></button>
    </form>

    <div hlmDialogFooter class="mt-2">
      <button
        hlmDialogClose
        hlmBtn
        variant="outline"
        type="button"
        [disabled]="cloning()"
      >
        Cancel
      </button>
      <button
        hlmBtn
        type="button"
        (click)="submit()"
        [disabled]="cloning() || !canSubmit()"
      >
        @if (cloning()) {
          <hlm-spinner aria-label="Cloning" />
        } @else {
          Clone repo
        }
      </button>
    </div>
  `,
})
export class CloneRepoDialog {
  private readonly ctx = injectBrnDialogContext<CloneRepoContext>();
  private readonly ref = inject(BrnDialogRef);
  private readonly dialogAdapter = inject(DIALOG_ADAPTER);

  protected readonly url = signal('');
  protected readonly location = signal(this.ctx.defaultLocation);
  protected readonly cloning = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly urlError = computed(() => {
    const u = this.url().trim();
    if (u.length === 0) return null;
    return GITHUB_URL_RE.test(u)
      ? null
      : 'Enter a GitHub URL like https://github.com/owner/repo';
  });

  protected readonly clonedFolderName = computed(() => {
    const u = this.url().trim();
    if (!GITHUB_URL_RE.test(u)) return null;
    const last = u.replace(/\/$/, '').split('/').pop() ?? '';
    return last.replace(/\.git$/, '');
  });

  protected readonly clonePreview = computed(() => {
    const name = this.clonedFolderName();
    const loc = this.location().trim();
    if (!name || loc.length === 0) return null;
    return `${loc}/${name}`;
  });

  protected readonly canSubmit = computed(
    () =>
      this.url().trim().length > 0 &&
      this.location().trim().length > 0 &&
      this.urlError() === null,
  );

  protected onUrlInput(event: Event): void {
    this.url.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected onLocationInput(event: Event): void {
    this.location.set((event.target as HTMLInputElement).value);
    this.error.set(null);
  }

  protected async browse(): Promise<void> {
    const picked = await this.dialogAdapter.pickFolder({
      defaultPath: this.location() || undefined,
    });
    if (picked) {
      this.location.set(picked);
      this.error.set(null);
    }
  }

  protected onFormSubmit(event: Event): void {
    event.preventDefault();
    void this.submit();
  }

  protected async submit(): Promise<void> {
    if (!this.canSubmit() || this.cloning()) return;
    this.cloning.set(true);
    this.error.set(null);
    try {
      const path = await this.ctx.doClone(this.url().trim(), this.location().trim());
      // Close the dialog before the post-clone navigation happens so the
      // user sees the new workspace appear, not the dialog dismissing
      // mid-navigation.
      this.ref.close();
      await this.ctx.onCloned(path);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.error.set(msg || 'Clone failed');
      this.cloning.set(false);
    }
  }
}
