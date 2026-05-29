import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { HlmAlertImports } from '@spartan-ui/alert';
import { HlmButtonImports } from '@spartan-ui/button';
import { HlmDialogImports, HlmDialogService } from '@spartan-ui/dialog';
import { HlmIconImports } from '@spartan-ui/icon';
import { HlmInputImports } from '@spartan-ui/input';
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import {
  lucideCircleCheck,
  lucideExternalLink,
  lucideGithub,
} from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { ExternalLinkService } from '@mozart/desktop-core-data-access';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';

export interface CreatePrDialogContext {
  readonly workspaceId: string;
  /** Used as the PR title and as the default commit message when the
   *  user commits a dirty tree from the dialog. The caller passes the
   *  workspace name. */
  readonly defaultTitle?: string;
  readonly defaultBody?: string;
  readonly onCreated?: (url: string) => void;
}

// Explicit, derived flow state. The requirement states
// (`checking` / `needs-*`) are computed from the live gates (GitHub
// auth, remote status, working-tree status, an existing PR); the action
// states (`committing` / `creating`) are driven by the `phase` signal
// while a submit is in flight. `pr-exists` covers BOTH a just-created PR
// and one persisted on the workspace from a previous session.
//
//   checking ──> needs-github-auth        (no token)
//            ──> needs-remote             (no/non-GitHub remote, or read error)
//            ──> needs-commit ──(commit all)──┐
//            ──> ready ──────────────────────┴──> creating ──> pr-exists
//                                                            └──> (error) back to form
type PrFlowState =
  | 'checking'
  | 'needs-github-auth'
  | 'needs-remote'
  | 'needs-commit'
  | 'ready'
  | 'committing'
  | 'creating'
  | 'pr-exists';

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
  providers: [
    provideIcons({ lucideCircleCheck, lucideExternalLink, lucideGithub }),
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div hlmDialogHeader class="px-6 py-4">
      <h3 hlmDialogTitle class="flex items-center gap-2">
        <ng-icon hlm name="lucideGithub" size="sm" />
        Create pull request
      </h3>
    </div>

    @switch (state()) {
      @case ('pr-exists') {
        <div class="px-6 py-4 space-y-3">
          <p class="flex items-center gap-2 text-sm">
            <ng-icon
              hlm
              name="lucideCircleCheck"
              size="sm"
              class="text-status-ok"
            />
            @if (justCreated()) {
              Pull request opened.
            } @else {
              A pull request is already open for this workspace.
            }
          </p>
          @if (prNumber(); as n) {
            <p class="text-xs text-muted-foreground">
              <span class="font-medium">#{{ n }}</span>
              · {{ resolvedTitle() }}
            </p>
          }
        </div>
        <div hlmDialogFooter class="px-6 py-4">
          <button hlmDialogClose hlmBtn variant="outline" type="button">
            Close
          </button>
          <button hlmBtn type="button" (click)="openInGithub()">
            <ng-icon hlm name="lucideExternalLink" size="xs" />
            Open in GitHub
          </button>
        </div>
      }
      @default {
        <!-- Connection status — always visible so the missing
             requirement is shown inside the dialog, not as a dead end. -->
        <div class="px-6 pt-2 pb-1">
          <div
            class="flex items-center justify-between gap-2 rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs"
          >
            @if (profile.githubConnected()) {
              <div class="flex items-center gap-2">
                <span
                  class="inline-block size-2 rounded-full bg-status-ok"
                  aria-hidden="true"
                ></span>
                <span class="text-foreground">
                  Connected as
                  <span class="font-medium">{{ githubLoginLabel() }}</span>
                </span>
                @if (provenanceLabel(); as p) {
                  <span class="text-muted-foreground">· {{ p }}</span>
                }
              </div>
            } @else {
              <div class="flex items-center gap-2">
                <span
                  class="inline-block size-2 rounded-full bg-status-busy"
                  aria-hidden="true"
                ></span>
                <span class="text-foreground">GitHub connection required</span>
              </div>
              <button
                hlmBtn
                size="sm"
                variant="default"
                type="button"
                class="h-6 px-2 text-xs"
                (click)="openConnectGithub()"
              >
                Connect GitHub
              </button>
            }
          </div>
        </div>

        @if (state() === 'needs-remote') {
          <div class="px-6 pt-3">
            <div hlmAlert variant="default">
              <p hlmAlertDescription>{{ remoteMessage() }}</p>
              @if (remoteStatus()?.kind === 'no-remote') {
                <ol
                  class="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground"
                >
                  <li>Create a repository on GitHub (or fork an existing one).</li>
                  <li>
                    Add it as the <code class="font-mono">origin</code> remote:
                    <code class="font-mono"
                      >git remote add origin git&#64;github.com:&lt;owner&gt;/&lt;repo&gt;.git</code
                    >
                  </li>
                  <li>
                    Push the base branch:
                    <code class="font-mono"
                      >git push -u origin {{ baseBranchLabel() }}</code
                    >
                  </li>
                  <li>Re-open this dialog — Mozart will pick up the remote.</li>
                </ol>
              }
            </div>
          </div>
        }

        @if (state() === 'needs-commit' || phase() === 'committing') {
          <div class="px-6 pt-3 space-y-2">
            <div hlmAlert variant="default">
              <p hlmAlertDescription>
                This workspace has uncommitted changes. Mozart will commit them
                all and include them in the pull request.
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
              [disabled]="phase() === 'committing'"
              (input)="onCommitMessageInput($event)"
            />
          </div>
        }

        <div class="px-6 py-4 space-y-2">
          <p class="text-sm">
            Open a pull request for
            <span class="font-medium">{{ resolvedTitle() }}</span
            >?
          </p>
          <p class="text-xs text-muted-foreground">
            Mozart pushes the workspace branch to its GitHub remote and opens
            the PR against
            <code class="font-mono">{{ baseBranchLabel() }}</code
            >.
          </p>
          @if (error(); as err) {
            <p class="text-xs text-destructive">{{ err }}</p>
          }
        </div>

        <div hlmDialogFooter class="px-6 py-4">
          @if (state() === 'needs-commit' || phase() === 'committing') {
            <button hlmDialogClose hlmBtn variant="ghost" type="button">
              Review changes first
            </button>
          } @else {
            <button hlmDialogClose hlmBtn variant="outline" type="button">
              Cancel
            </button>
          }
          <button
            hlmBtn
            type="button"
            [disabled]="!canSubmit()"
            (click)="onSubmit()"
          >
            @switch (state()) {
              @case ('checking') {
                Checking…
              }
              @case ('committing') {
                Committing…
              }
              @case ('creating') {
                Pushing &amp; opening PR…
              }
              @case ('needs-commit') {
                Commit all &amp; create PR
              }
              @default {
                Open pull request
              }
            }
          </button>
        </div>
      }
    }
  `,
})
export class FeatureCreatePrDialog {
  protected readonly ctx = injectBrnDialogContext<CreatePrDialogContext>();
  private readonly ref = inject(BrnDialogRef);
  protected readonly profile = inject(ProfileFacade);
  private readonly workspaces = inject(WorkspacesFacade);
  private readonly projects = inject(ProjectsFacade);
  private readonly repos = inject(RepositoriesFacade);
  private readonly dialogService = inject(HlmDialogService);
  private readonly externalLink = inject(ExternalLinkService);

  // `phase` drives the in-flight action states; everything else is
  // derived from live gates. `null` probes = pending.
  protected readonly phase = signal<'idle' | 'committing' | 'creating'>('idle');
  protected readonly error = signal<string | null>(null);
  private readonly createdPr = signal<{ url: string; number: number } | null>(
    null,
  );
  protected readonly justCreated = computed(() => this.createdPr() !== null);
  // Working-tree paths pulled fresh on open. Null = probe pending.
  private readonly changedPaths = signal<readonly string[] | null>(null);
  protected readonly commitMessage = signal('');

  private readonly workspace = computed(() =>
    this.workspaces.workspaceById(this.ctx.workspaceId)(),
  );

  private readonly projectId = computed(() => this.workspace()?.projectId ?? null);

  protected readonly remoteStatus = computed(() => {
    const pid = this.projectId();
    if (!pid) return null;
    return this.projects.githubRemoteStatusFor(pid)();
  });

  protected readonly baseBranchLabel = computed(
    () => this.workspace()?.baseBranch ?? 'main',
  );

  protected readonly resolvedTitle = computed(() => {
    const t = (this.ctx.defaultTitle ?? '').trim();
    return t.length > 0 ? t : 'Mozart pull request';
  });

  protected readonly githubLoginLabel = computed(() => {
    const login = this.profile.githubLogin();
    return login ? `@${login}` : 'GitHub';
  });

  protected readonly provenanceLabel = computed(() => {
    switch (this.profile.githubKind()) {
      case 'oauth_clerk':
        return 'OAuth';
      case 'pat':
        return 'Personal access token';
      default:
        return null;
    }
  });

  // Existing PR — just-created this session, else persisted on the row.
  protected readonly prUrl = computed(
    () => this.createdPr()?.url ?? this.workspace()?.pr?.url ?? null,
  );
  protected readonly prNumber = computed(
    () => this.createdPr()?.number ?? this.workspace()?.pr?.number ?? null,
  );

  private readonly hasUncommitted = computed(
    () => (this.changedPaths()?.length ?? 0) > 0,
  );
  private readonly probing = computed(
    () => this.remoteStatus() === null || this.changedPaths() === null,
  );

  protected readonly remoteMessage = computed(() => {
    const rs = this.remoteStatus();
    switch (rs?.kind) {
      case 'no-remote':
        return "The source repository has no Git remote configured. Add a GitHub remote to open a pull request.";
      case 'non-github':
        return `PR creation currently requires a GitHub remote. This project's remote is ${rs.url}.`;
      case 'error':
        return `Couldn't read this project's Git remotes: ${rs.message}`;
      default:
        return '';
    }
  });

  protected readonly state = computed<PrFlowState>(() => {
    if (this.prUrl()) return 'pr-exists';
    if (this.phase() === 'committing') return 'committing';
    if (this.phase() === 'creating') return 'creating';
    if (this.probing()) return 'checking';
    // Repo-level blocker first: a non-GitHub repo can't get a PR no
    // matter the auth state. The connection row stays visible either way.
    if (this.remoteStatus()?.kind !== 'github') return 'needs-remote';
    if (!this.profile.githubConnected()) return 'needs-github-auth';
    if (this.hasUncommitted()) return 'needs-commit';
    return 'ready';
  });

  // Submit is enabled only when there's an actionable next step the
  // button itself performs. needs-github-auth / needs-remote keep it
  // disabled because the next action lives elsewhere (Connect button /
  // fixing the remote) — and that next step is always shown inline.
  protected readonly canSubmit = computed(() => {
    switch (this.state()) {
      case 'ready':
        return true;
      case 'needs-commit':
        return this.commitMessage().trim().length > 0;
      default:
        return false;
    }
  });

  constructor() {
    const pid = this.projectId();
    if (pid) void this.projects.ensureGithubRemoteStatus(pid);
    this.commitMessage.set(this.resolvedTitle());
    void this.repos
      .listChangedFiles(this.ctx.workspaceId)
      .then((files) => this.changedPaths.set(files.map((f) => f.path)))
      .catch((err) => {
        console.warn('[create-pr] list changed files failed:', err);
        this.changedPaths.set([]);
      });
  }

  protected onCommitMessageInput(event: Event): void {
    this.commitMessage.set((event.target as HTMLInputElement).value);
  }

  protected openInGithub(): void {
    const url = this.prUrl();
    if (url) void this.externalLink.openExternal(url);
  }

  protected async onSubmit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.error.set(null);
    try {
      if (this.state() === 'needs-commit') {
        this.phase.set('committing');
        const paths = this.changedPaths() ?? [];
        await this.workspaces.commitWorkspace(
          this.ctx.workspaceId,
          paths,
          this.commitMessage().trim(),
        );
        this.changedPaths.set([]);
      }
      this.phase.set('creating');
      const result = await this.workspaces.createPr(
        this.ctx.workspaceId,
        this.resolvedTitle(),
        this.ctx.defaultBody ?? '',
        false,
      );
      this.createdPr.set({
        url: result.pr.htmlUrl,
        number: result.pr.number,
      });
      this.ctx.onCreated?.(result.pr.htmlUrl);
      if (result.statusFlipFailed) {
        toast.error('PR opened, but status update failed — refresh to retry.');
      }
    } catch (err) {
      this.error.set(readErrorText(err));
    } finally {
      this.phase.set('idle');
    }
  }

  protected async openConnectGithub(): Promise<void> {
    const { UiGithubConnectDialog } = await import(
      '@mozart/desktop-profile-feature'
    );
    this.dialogService.open(UiGithubConnectDialog, {});
  }
}

// `workspaces.createPr` routes through the bespoke-unwrap adapter that
// throws the raw `AppError` ({ kind, message }) rather than wrapping it
// in `new Error(...)`. Read `.message` from any thrown object that has a
// string-typed one so the dialog never renders "[object Object]".
function readErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return String(err);
}
