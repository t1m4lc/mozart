import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HlmAlertImports } from '@spartan-ui/alert';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogImports } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInputImports } from '@spartan-ui/input';
import { HlmLabelImports } from '@spartan-ui/label';
import { HlmSpinnerImports } from '@spartan-ui/spinner';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCheck,
  lucideFolderOpen,
  lucideGithub,
  lucideLock,
  lucideSearch,
} from '@ng-icons/lucide';
import {
  CREDENTIALS_ADAPTER,
  ProfileFacade,
  type GithubRepo,
} from '@mozart/desktop-profile-data-access';
import { DIALOG_ADAPTER } from '@mozart/desktop-projects-data-access';

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

// "Clone GitHub repo" dialog. Two paths to a URL:
//   1. If GitHub is connected via Clerk OAuth or PAT → search-filter
//      list of the user's repos, click to pick. Repos are fetched
//      lazily on first dialog open and cached for the dialog's
//      lifetime via the profile-data-access port.
//   2. Always available — paste a URL directly into the input below.
//
// Plain signal-based form state, matches CloneRepoDialog / UiConnectDialog.

// Match `https://github.com/owner/repo` with an optional `.git` suffix.
// Trailing slash tolerated. Owner / repo allow word chars, dots, and
// hyphens — matching GitHub's own naming rules.
const GITHUB_URL_RE =
  /^https?:\/\/github\.com\/[\w.-]+\/[\w.-]+?(?:\.git)?\/?$/;

// Cap the filtered-list render to keep the dialog compact; the search
// field whittles a typical 50-200-repo account down to a usable list.
const MAX_VISIBLE_REPOS = 8;

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
  providers: [
    provideIcons({
      lucideCheck,
      lucideFolderOpen,
      lucideGithub,
      lucideLock,
      lucideSearch,
    }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle>Clone GitHub repo</h3>
      <p hlmDialogDescription>
        @if (profile.githubConnected()) {
          Pick a repo from your GitHub account.
        } @else {
          Paste a repository URL.
        }
      </p>
    </div>

    <form
      class="px-6 py-4 space-y-4"
      (submit)="onFormSubmit($event)"
      autocomplete="off"
    >
      @if (profile.githubConnected()) {
        <div class="space-y-1.5">
          <label hlmLabel for="repo-search">Your repos</label>
          @if (pickedRepoFullName(); as picked) {
            <div
              class="flex items-center gap-2 rounded-md border border-emerald-500/40 bg-emerald-500/5 px-3 py-2 text-sm"
            >
              <ng-icon
                name="lucideCheck"
                class="text-emerald-600 dark:text-emerald-400"
                aria-hidden="true"
              />
              <ng-icon
                name="lucideGithub"
                class="text-muted-foreground"
                aria-hidden="true"
              />
              <span class="font-medium truncate flex-1">{{ picked }}</span>
              <button
                hlmBtn
                variant="ghost"
                size="sm"
                type="button"
                class="h-6 px-2 text-xs"
                (click)="clearPickedRepo()"
                [disabled]="cloning()"
              >
                Change
              </button>
            </div>
          } @else {
            <div class="relative">
              <ng-icon
                hlm
                name="lucideSearch"
                size="sm"
                class="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                hlmInput
                type="search"
                id="repo-search"
                name="repoSearch"
                placeholder="Filter by name…"
                autocomplete="off"
                spellcheck="false"
                autocapitalize="off"
                class="pl-8"
                #focusInput
                [value]="repoFilter()"
                (input)="onRepoFilterInput($event)"
                [disabled]="cloning()"
              />
            </div>
            @if (loadingRepos()) {
              <p class="flex items-center gap-2 text-xs text-muted-foreground">
                <hlm-spinner aria-label="Loading repos" class="size-3" />
                Loading your GitHub repos…
              </p>
            } @else if (reposError(); as msg) {
              <p class="text-xs text-destructive">{{ msg }}</p>
            } @else if (filteredRepos().length === 0 && repos().length > 0) {
              <p class="text-xs text-muted-foreground">
                No repo matches "{{ repoFilter() }}".
              </p>
            } @else if (filteredRepos().length > 0) {
              <ul class="max-h-64 overflow-y-auto rounded-md border border-border/60 bg-card">
                @for (r of filteredRepos(); track r.fullName) {
                  <li>
                    <button
                      type="button"
                      class="w-full flex items-start gap-2 px-3 py-2 text-left text-sm hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none border-b border-border/40 last:border-b-0"
                      [disabled]="cloning()"
                      (click)="pickRepo(r)"
                    >
                      <ng-icon
                        name="lucideGithub"
                        class="mt-0.5 text-[14px] text-muted-foreground shrink-0"
                      />
                      <span class="min-w-0 flex-1">
                        <span class="flex items-center gap-1.5">
                          <span class="font-medium truncate">{{ r.fullName }}</span>
                          @if (r.private) {
                            <ng-icon
                              name="lucideLock"
                              class="text-[10px] text-muted-foreground"
                              aria-label="Private"
                            />
                          }
                        </span>
                        @if (r.description) {
                          <span class="block text-xs text-muted-foreground truncate">
                            {{ r.description }}
                          </span>
                        }
                      </span>
                    </button>
                  </li>
                }
              </ul>
              @if (repos().length > filteredRepos().length) {
                <p class="text-[11px] text-muted-foreground">
                  Showing {{ filteredRepos().length }} of {{ repos().length }}.
                  Keep typing to narrow it down.
                </p>
              }
            }
          }
        </div>
      } @else {
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
            #focusInput
            [value]="url()"
            (input)="onUrlInput($event)"
            [disabled]="cloning()"
            [attr.aria-invalid]="urlError() ? true : null"
            aria-describedby="clone-url-error"
          />
          @if (urlError()) {
            <p id="clone-url-error" class="text-xs text-destructive">
              {{ urlError() }}
            </p>
          }
        </div>
      }

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

    <div hlmDialogFooter class="px-6 py-4">
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
  private readonly credentials = inject(CREDENTIALS_ADAPTER);
  protected readonly profile = inject(ProfileFacade);
  private readonly focusInput =
    viewChild<ElementRef<HTMLInputElement>>('focusInput');

  protected readonly url = signal('');
  protected readonly location = signal(this.ctx.defaultLocation);
  protected readonly cloning = signal(false);
  protected readonly error = signal<string | null>(null);

  protected readonly repos = signal<readonly GithubRepo[]>([]);
  protected readonly repoFilter = signal('');
  protected readonly loadingRepos = signal(false);
  protected readonly reposError = signal<string | null>(null);
  /** Full name (`owner/repo`) of the repo the user picked from the
   *  combobox. Drives the swap between "picker open" and "picked card"
   *  modes. `null` when nothing is selected. */
  protected readonly pickedRepoFullName = signal<string | null>(null);

  constructor() {
    afterNextRender(() => this.focusInput()?.nativeElement.focus());
    // Lazy: only fetch when GitHub is already connected. The boot probe
    // in `ProfileFacade.initializeGithub` auto-connects when Clerk
    // exposes a github_username, so by the time the user opens this
    // dialog the connection state is usually settled.
    if (this.profile.githubConnected()) {
      void this.loadRepos();
    }
  }

  protected readonly filteredRepos = computed(() => {
    const q = this.repoFilter().trim().toLowerCase();
    const all = this.repos();
    const matches = q.length === 0
      ? all
      : all.filter((r) =>
          r.fullName.toLowerCase().includes(q) ||
          (r.description ?? '').toLowerCase().includes(q),
        );
    return matches.slice(0, MAX_VISIBLE_REPOS);
  });

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

  protected onRepoFilterInput(event: Event): void {
    this.repoFilter.set((event.target as HTMLInputElement).value);
  }

  protected pickRepo(repo: GithubRepo): void {
    // GitHub's clone_url is always https; this matches our existing
    // GITHUB_URL_RE without needing user normalization.
    this.url.set(repo.cloneUrl);
    this.pickedRepoFullName.set(repo.fullName);
    this.repoFilter.set('');
    this.error.set(null);
  }

  protected clearPickedRepo(): void {
    this.pickedRepoFullName.set(null);
    this.url.set('');
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

  private async loadRepos(): Promise<void> {
    this.loadingRepos.set(true);
    this.reposError.set(null);
    try {
      const repos = await this.credentials.listClerkGithubRepos();
      this.repos.set(repos);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.reposError.set(msg || 'Could not load your GitHub repos.');
    } finally {
      this.loadingRepos.set(false);
    }
  }
}
