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
import { BrnDialogRef, injectBrnDialogContext } from '@spartan-ng/brain/dialog';
import { NgIcon, provideIcons } from '@ng-icons/core';
import { lucideExternalLink, lucideGithub } from '@ng-icons/lucide';
import { toast } from '@spartan-ng/brain/sonner';
import { ProfileFacade } from '@mozart/desktop-profile-data-access';
import { ProjectsFacade } from '@mozart/desktop-projects-data-access';
import { RepositoriesFacade } from '@mozart/desktop-repositories-data-access';
import { WorkspacesFacade } from '@mozart/desktop-workspaces-data-access';

export interface CreatePrDialogContext {
  readonly workspaceId: string;
  /** Used verbatim as the PR title. The caller (shell-right /
   *  workspace-detail.page) passes the workspace name. Inputs were
   *  removed in favor of an auto-title — a future agent will craft
   *  the title + body, but for now a generic workspace-name title
   *  is enough. */
  readonly defaultTitle?: string;
  readonly defaultBody?: string;
  readonly onCreated?: (url: string) => void;
}

// Layout (mirrors v2 design — see plan):
//   - Persistent status row at the top: connection + GitHub-remote
//     state. Inline "Connect GitHub" button when not connected; the
//     submit below stays gated by `canSubmit` so the form is visible
//     either way.
//   - Body: confirmation prompt for the PR; non-blocking warning row
//     when the project has no GitHub remote.
//   - Success state replaces the whole body with the resulting URL.
@Component({
  selector: 'app-feature-create-pr-dialog',
  imports: [
    NgIcon,
    HlmAlertImports,
    HlmButtonImports,
    HlmDialogImports,
    HlmIconImports,
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
        <p class="text-sm text-muted-foreground">Pull request opened.</p>
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
              <span class="text-foreground">GitHub not connected</span>
            </div>
            <button
              hlmBtn
              size="sm"
              variant="secondary"
              type="button"
              class="h-6 px-2 text-xs"
              (click)="openConnectGithub()"
            >
              Connect GitHub
            </button>
          }
        </div>
      </div>

      @if (!isGithubRemote()) {
        <div class="px-6 pt-3">
          <div hlmAlert variant="default">
            <p hlmAlertDescription>
              This workspace's project isn't linked to a GitHub remote. To
              open a pull request:
            </p>
            <ol
              class="mt-2 list-decimal space-y-1 pl-5 text-xs text-muted-foreground"
            >
              <li>
                Create a repository on GitHub (or fork an existing one).
              </li>
              <li>
                Add it as the <code class="font-mono">origin</code> remote
                inside your project:
                <code class="font-mono"
                  >git remote add origin git&#64;github.com:&lt;owner&gt;/&lt;repo&gt;.git</code
                >
              </li>
              <li>
                Push the base branch:
                <code class="font-mono">git push -u origin {{ baseBranchLabel() }}</code>
              </li>
              <li>Re-open this dialog — Mozart will pick up the remote.</li>
            </ol>
          </div>
        </div>
      }

      @if (hasUncommittedChanges()) {
        <div class="px-6 pt-3">
          <div hlmAlert variant="destructive">
            <p hlmAlertDescription>
              You have uncommitted changes in this workspace. Commit them
              first — Mozart pushes the branch as-is and a PR opened from a
              dirty tree won't include your local edits.
            </p>
          </div>
        </div>
      }

      <div class="px-6 py-4 space-y-2">
        <p class="text-sm">
          Open a pull request for
          <span class="font-medium">{{ resolvedTitle() }}</span
          >?
        </p>
        <p class="text-xs text-muted-foreground">
          Mozart pushes the workspace branch to
          <code class="font-mono">origin</code> and opens the PR against the
          workspace's base branch. Title + description will be drafted by
          the agent in a future release; for now a generic title is used.
        </p>
        @if (error(); as err) {
          <p class="text-xs text-destructive">{{ err }}</p>
        }
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
            Open pull request
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
  private readonly projects = inject(ProjectsFacade);
  private readonly repos = inject(RepositoriesFacade);
  private readonly dialogService = inject(HlmDialogService);

  protected readonly submitting = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly createdUrl = signal<string | null>(null);
  // Pulled fresh on dialog open via `listChangedFiles`. Null = pending;
  // any working-tree file (staged or unstaged) flips this true so the
  // user gets a clear "commit first" warning before pushing.
  protected readonly hasUncommittedChanges = signal<boolean>(false);

  protected readonly baseBranchLabel = computed(() => {
    const ws = this.workspaces.workspaceById(this.ctx.workspaceId)();
    return ws?.baseBranch ?? 'main';
  });

  // Auto-title — workspace name from context, with a defensive
  // fallback so the GitHub API never sees an empty title.
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
        return 'via OAuth';
      case 'pat':
        return 'via personal access token';
      default:
        return null;
    }
  });

  // Workspace → project resolution for the GitHub-remote gate. Null
  // until the workspace row is in the store (race-safe on direct
  // dialog mount before WorkspacesFacade has loaded).
  private readonly projectId = computed(() => {
    const ws = this.workspaces.workspaceById(this.ctx.workspaceId)();
    return ws?.projectId ?? null;
  });

  // True only once the probe resolves AND the origin really is
  // github.com. `null` (probe pending) and `false` both gate to the
  // "no GitHub remote" guidance state — defensive default until the
  // probe lands.
  protected readonly isGithubRemote = computed(() => {
    const pid = this.projectId();
    if (!pid) return false;
    return this.projects.isGithubRemoteFor(pid)() === true;
  });

  constructor() {
    // Kick the lazy isGithubRemote read. The dialog can mount before
    // shell-right's effect has fired for this workspace (e.g., the
    // user opens PR from a keyboard shortcut). Idempotent.
    const pid = this.projectId();
    if (pid) void this.projects.ensureIsGithubRemote(pid);
    // Working-tree probe — surfaces a hard block when the user has
    // edits the upcoming `git push` wouldn't carry to the PR. Fire and
    // forget; the warning row stays hidden until this resolves.
    void this.repos
      .listChangedFiles(this.ctx.workspaceId)
      .then((files) => this.hasUncommittedChanges.set(files.length > 0))
      .catch((err) => {
        console.warn('[create-pr] list changed files failed:', err);
      });
  }

  // Submit fires only when all gates pass: GitHub auth + GitHub remote
  // on the project + a clean working tree. The persistent status rows
  // above keep those gates visible to the user.
  protected readonly canSubmit = computed(
    () =>
      !this.submitting() &&
      this.profile.githubConnected() &&
      this.isGithubRemote() &&
      !this.hasUncommittedChanges(),
  );

  protected async onSubmit(): Promise<void> {
    if (!this.canSubmit()) return;
    this.submitting.set(true);
    this.error.set(null);
    try {
      const result = await this.workspaces.createPr(
        this.ctx.workspaceId,
        this.resolvedTitle(),
        this.ctx.defaultBody ?? '',
        false,
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
      this.error.set(readErrorText(err));
    } finally {
      this.submitting.set(false);
    }
  }

  // Dynamic import keeps the profile-feature chunk out of the
  // repositories-feature eager bundle. The connect dialog overlays this
  // one; on successful connect, githubConnected() flips reactively and
  // this dialog re-renders with the green status row — the user can
  // then click Open pull request without re-opening anything.
  protected async openConnectGithub(): Promise<void> {
    const { UiGithubConnectDialog } = await import(
      '@mozart/desktop-profile-feature'
    );
    this.dialogService.open(UiGithubConnectDialog, {});
  }
}

// `workspaces.createPr` routes through the bespoke-unwrap adapter that
// throws the raw `AppError` ({ kind, message }) rather than wrapping
// it in `new Error(...)`. `instanceof Error` is false for plain
// objects, so a naive `err.message` access would render
// "[object Object]". Read `.message` from any thrown object that has
// a string-typed one.
function readErrorText(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === 'object' && 'message' in err) {
    const msg = (err as { message: unknown }).message;
    if (typeof msg === 'string') return msg;
  }
  return String(err);
}
